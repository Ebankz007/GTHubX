/**
 * Registration settlement — the adapter that turns a pure engine plan into
 * durable rows.
 *
 * Phase 6a. The engine (`lib/engine`) never touches a database; this module is
 * the thin layer that does. The split of responsibility is deliberate:
 *
 *   planRegistrationSettlement  - pure. Engine calls only. Unit-tested.
 *   settleRegistrationPayment   - writes. Runs inside the caller's
 *                                 transaction, so the payment flip to PAID and
 *                                 every credit it caused commit together or
 *                                 not at all.
 *
 * Trigger discipline: commissions accrue when a registration payment is
 * CONFIRMED, never at signup. Crediting an unpaid registration would pay real
 * money out of a fee nobody paid.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PLATFORM_FEE_CENTS, buildNetworkIndex, type NetworkIndex } from "@/lib/engine";
import { planRegistrationSettlement, type RegistrationPlan } from "./plan";

// The planner is pure and lives in ./plan.ts so it can be unit-tested without a
// database client; re-exported here because callers settle through this module.
export { planRegistrationSettlement, type RegistrationPlan };

/** A transaction client, or the root client for non-transactional use. */
export type SettleClient = Prisma.TransactionClient | typeof prisma;

export type RegistrationSettlementResult = {
  readonly paymentId: string;
  readonly newMemberId: string;
  readonly direct: RegistrationPlan["direct"];
  readonly generations: RegistrationPlan["generations"];
  readonly rankPoolCents: number;
  readonly leadershipPoolCents: number;
  /** What the plan allocated to generation bonuses. */
  readonly generationAllocatedCents: number;
  /** What was actually credited (less when the tree is shallower than gen 6). */
  readonly generationPaidCents: number;
  readonly platformFeeCents: number;
};

/**
 * Build the engine's network index from the database.
 *
 * Loads every member as a node and hands the flat list to the engine's own
 * `buildNetworkIndex`, so sponsor-edge wiring lives in exactly one place. Fine
 * at this stage's scale; if member count ever makes it expensive, replace the
 * body with an incremental index — callers only depend on the signature.
 */
export async function buildIndexFromDb(client: SettleClient = prisma): Promise<NetworkIndex> {
  const members = await client.user.findMany({
    select: {
      id: true,
      sponsorId: true,
      isActiveMember: true,
      highestAssociateRank: true,
      highestLeadershipRank: true,
    },
  });

  return buildNetworkIndex(
    members.map((m) => ({
      id: m.id,
      sponsorId: m.sponsorId,
      isActive: m.isActiveMember,
      highestAssociateRank: m.highestAssociateRank,
      highestLeadershipRank: m.highestLeadershipRank,
    })),
  );
}

/** Credit a member's wallet and record it in the immutable ledger. */
async function creditWallet(
  client: SettleClient,
  args: {
    readonly userId: string;
    readonly amountCents: number;
    readonly sourceUserId: string;
    readonly paymentId: string;
    readonly idempotencyKey: string;
    readonly description: string;
  },
): Promise<void> {
  const { balanceCents } = await client.wallet.upsert({
    where: { userId: args.userId },
    create: { userId: args.userId, balanceCents: args.amountCents },
    update: { balanceCents: { increment: args.amountCents } },
    select: { balanceCents: true },
  });

  await client.ledgerEntry.create({
    data: {
      userId: args.userId,
      direction: "CREDIT",
      type: "COMMISSION",
      amountCents: args.amountCents,
      balanceAfterCents: balanceCents,
      currency: "USD",
      sourceUserId: args.sourceUserId,
      refType: "PAYMENT",
      refId: args.paymentId,
      description: args.description,
      idempotencyKey: args.idempotencyKey,
    },
  });
}

/** Accrue into a shared pool and record the movement on the pool ledger. */
async function accruePool(
  client: SettleClient,
  args: {
    readonly kind: "RANK" | "LEADERSHIP";
    readonly amountCents: number;
    readonly paymentId: string;
  },
): Promise<void> {
  if (args.amountCents <= 0) return;

  const pool = await client.bonusPool.upsert({
    where: { kind: args.kind },
    create: { kind: args.kind, accruedCents: args.amountCents },
    update: { accruedCents: { increment: args.amountCents } },
    select: { id: true, accruedCents: true },
  });

  await client.poolLedgerEntry.create({
    data: {
      poolId: pool.id,
      kind: args.kind,
      entryType: "ACCRUAL",
      amountCents: args.amountCents,
      balanceAfterCents: pool.accruedCents,
      refType: "PAYMENT",
      refId: args.paymentId,
    },
  });
}

/**
 * Settle a confirmed registration payment.
 *
 * Caller supplies the transaction client, so this commits (or rolls back)
 * together with the payment status flip. Requires the payment to still be
 * PENDING: double-settling is prevented by that check, and independently by
 * the unique `idempotencyKey` on every credit it writes.
 *
 * @throws if the payment is missing, not REGISTRATION, or already settled.
 */
export async function settleRegistrationPayment(args: {
  readonly client: SettleClient;
  readonly paymentId: string;
  readonly adminId?: string | null;
  readonly gatewayTxid?: string | null;
}): Promise<RegistrationSettlementResult> {
  const { client, paymentId } = args;

  const payment = await client.payment.findUnique({
    where: { id: paymentId },
    include: { user: { select: { id: true, email: true, sponsorId: true } } },
  });
  if (!payment) throw new SettlementError("payment_not_found", `No payment ${paymentId}`);
  if (payment.purpose !== "REGISTRATION") {
    throw new SettlementError("wrong_purpose", `Payment ${paymentId} is ${payment.purpose}`);
  }
  if (payment.status !== "PENDING") {
    throw new SettlementError(
      "already_settled",
      `Payment ${paymentId} is ${payment.status}, expected PENDING`,
    );
  }

  const newMemberId = payment.user.id;
  const index = await buildIndexFromDb(client);
  const plan = planRegistrationSettlement({ index, newMemberId });

  // The gateway charges gross ($55); the $5 platform fee is operator revenue
  // and never enters the compensation split.
  const grossCents = plan.feeCents + PLATFORM_FEE_CENTS;
  if (payment.amountCents !== grossCents) {
    throw new SettlementError(
      "amount_mismatch",
      `Payment ${paymentId} is ${payment.amountCents}c, expected ${grossCents}c`,
    );
  }

  await client.payment.update({
    where: { id: paymentId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      gatewayTxid: args.gatewayTxid ?? payment.gatewayTxid,
    },
  });

  await client.platformFee.create({
    data: {
      userId: newMemberId,
      paymentId,
      purpose: "REGISTRATION",
      amountCents: PLATFORM_FEE_CENTS,
      status: "SETTLED",
      settledAt: new Date(),
      settledById: args.adminId ?? null,
    },
  });

  await client.registration.create({
    data: {
      userId: newMemberId,
      sponsorId: payment.user.sponsorId,
      feeCents: plan.feeCents,
      companyReserveCents: plan.allocation.companyReserveCents,
      directReferralCents: plan.direct?.amountCents ?? 0,
      generationCents: plan.allocation.generationPoolCents,
      rankPoolCents: plan.rankPoolCents,
      leadershipPoolCents: plan.leadershipPoolCents,
      currency: "USD",
    },
  });

  if (plan.direct) {
    await client.commission.create({
      data: {
        userId: plan.direct.recipientId,
        type: "DIRECT_REFERRAL_BONUS",
        amountCents: plan.direct.amountCents,
        status: "PAID",
        sourceUserId: newMemberId,
        refType: "PAYMENT",
        refId: paymentId,
        description: `Direct referral bonus - registration ${paymentId}`,
        idempotencyKey: `reg:${paymentId}:direct`,
      },
    });
    await creditWallet(client, {
      userId: plan.direct.recipientId,
      amountCents: plan.direct.amountCents,
      sourceUserId: newMemberId,
      paymentId,
      idempotencyKey: `reg:${paymentId}:direct`,
      description: `Direct referral bonus - registration ${paymentId}`,
    });
  }

  let generationPaidCents = 0;
  for (const credit of plan.generations) {
    const key = `reg:${paymentId}:gen${credit.generation}`;
    await client.commission.create({
      data: {
        userId: credit.recipientId,
        type: "GENERATION_BONUS",
        amountCents: credit.amountCents,
        status: "PAID",
        sourceUserId: newMemberId,
        refType: "PAYMENT",
        refId: paymentId,
        description: `Generation ${credit.generation} bonus - registration ${paymentId}`,
        idempotencyKey: key,
      },
    });
    await creditWallet(client, {
      userId: credit.recipientId,
      amountCents: credit.amountCents,
      sourceUserId: newMemberId,
      paymentId,
      idempotencyKey: key,
      description: `Generation ${credit.generation} bonus - registration ${paymentId}`,
    });
    generationPaidCents += credit.amountCents;
  }

  await accruePool(client, {
    kind: "RANK",
    amountCents: plan.rankPoolCents,
    paymentId,
  });
  await accruePool(client, {
    kind: "LEADERSHIP",
    amountCents: plan.leadershipPoolCents,
    paymentId,
  });

  return {
    paymentId,
    newMemberId,
    direct: plan.direct,
    generations: plan.generations,
    rankPoolCents: plan.rankPoolCents,
    leadershipPoolCents: plan.leadershipPoolCents,
    generationAllocatedCents: plan.allocation.generationPoolCents,
    generationPaidCents,
    platformFeeCents: PLATFORM_FEE_CENTS,
  };
}

/** Settlement failures are operational, not bugs — callers map these to HTTP. */
export class SettlementError extends Error {
  readonly code:
    | "payment_not_found"
    | "wrong_purpose"
    | "already_settled"
    | "amount_mismatch";

  constructor(code: SettlementError["code"], message: string) {
    super(message);
    this.name = "SettlementError";
    this.code = code;
  }
}
