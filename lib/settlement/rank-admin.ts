import type { RankAwardStatus } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import { creditWallet, type SettleClient } from "./wallet";

/**
 * GTHubX — flagged rank-award admin flow (Phase 6d).
 *
 * A FLAGGED Associate award is a milestone the pool could not fund at
 * settlement time. Later registrations re-accrue the RANK pool, so an admin
 * can come back and either:
 *
 *   MARK_PAID — pay it from the pool's available balance, IF the pool covers
 *               it now. Same money shape the automatic path uses: pool
 *               increment + PoolLedgerEntry (PAYOUT) + Commission
 *               (RANK_MILESTONE) + wallet credit, all one transaction.
 *   REJECT    — close it without payment. No money moves: nothing was ever
 *               held, so there is nothing to refund. The member keeps the
 *               rank (qualification is a fact — see 6b); only the payout
 *               promise ends.
 *
 * Funding rule, stated once: money comes ONLY from the RANK pool when it
 * covers the award. No new money source is invented — the shortfall flag
 * exists precisely so the system never pays what it does not have.
 *
 * Leadership (SKU) awards are refused: fulfilling a physical SKU is delivery
 * policy, not a pool decision.
 *
 * Concurrency: the transition is claimed with a conditional `updateMany`
 * matching FLAGGED (same discipline as `lib/payouts/admin.ts`); the pool
 * increment happens first and is then VERIFIED against accrued
 * (`paid <= accrued`), so a race with an automatic settlement cannot take
 * the pool negative — the overshoot throws `pool_short` and the whole
 * transaction (claim included) rolls back.
 */

export type RankAwardAction = "MARK_PAID" | "REJECT";

export const RANK_AWARD_ACTIONS: readonly RankAwardAction[] = [
  "MARK_PAID",
  "REJECT",
];

export function isRankAwardAction(value: unknown): value is RankAwardAction {
  return (
    typeof value === "string" &&
    (RANK_AWARD_ACTIONS as readonly string[]).includes(value)
  );
}

export type RankAwardTransition =
  | { allowed: true; next: RankAwardStatus; money: "pool-pay" | "none" }
  | { allowed: false; reason: string };

/**
 * The complete matrix. Only FLAGGED Associate awards are actionable:
 *
 *   ASSOCIATE FLAGGED --MARK_PAID--> PAID    (pool-pay, coverage permitting)
 *   ASSOCIATE FLAGGED --REJECT----> REJECTED (no money)
 *   anything else                  refused
 */
export function rankAwardTransition(
  status: RankAwardStatus,
  kind: string,
  action: RankAwardAction,
): RankAwardTransition {
  if (kind !== "ASSOCIATE") {
    return {
      allowed: false,
      reason:
        "Leadership awards are physical SKUs — only Associate cash awards can be actioned here.",
    };
  }
  if (status === "PAID") {
    return { allowed: false, reason: "This award has already been paid." };
  }
  if (status === "REJECTED") {
    return { allowed: false, reason: "This award has been rejected." };
  }
  if (status !== "FLAGGED") {
    return {
      allowed: false,
      reason: "Only a flagged (unfunded) award can be actioned.",
    };
  }
  return action === "MARK_PAID"
    ? { allowed: true, next: "PAID", money: "pool-pay" }
    : { allowed: true, next: "REJECTED", money: "none" };
}

/* ---------------------------------------------------------------- errors -- */

export type RankAwardErrorCode = "not_found" | "invalid_transition" | "pool_short";

const RANK_AWARD_ERROR_STATUS: Record<RankAwardErrorCode, number> = {
  not_found: 404,
  invalid_transition: 409,
  pool_short: 409,
};

export class RankAwardError extends Error {
  readonly code: RankAwardErrorCode;

  constructor(code: RankAwardErrorCode, message: string) {
    super(message);
    this.name = "RankAwardError";
    this.code = code;
  }

  get status(): number {
    return RANK_AWARD_ERROR_STATUS[this.code];
  }
}

/* ---------------------------------------------------------------- writer -- */

export async function actOnRankAward(input: {
  readonly client: SettleClient;
  readonly awardId: string;
  readonly action: RankAwardAction;
}): Promise<{
  status: RankAwardStatus;
  paidCents: number | null;
  poolAvailableCents: number;
}> {
  const { client, awardId, action } = input;

  const award = await client.rankAward.findUnique({ where: { id: awardId } });
  if (!award) {
    throw new RankAwardError("not_found", "Rank award not found.");
  }

  const rule = rankAwardTransition(award.status, award.kind, action);
  if (!rule.allowed) {
    throw new RankAwardError("invalid_transition", rule.reason);
  }

  const pool = await client.bonusPool.upsert({
    where: { kind: "RANK" },
    create: { kind: "RANK", accruedCents: 0 },
    update: {},
    select: { id: true, accruedCents: true, paidCents: true },
  });

  if (rule.money === "pool-pay") {
    // ASSOCIATE cash awards always carry rewardCents; null here would be
    // corruption, and paying 0 for a milestone is worse than refusing loudly.
    if (award.rewardCents === null || award.rewardCents <= 0) {
      throw new RankAwardError(
        "invalid_transition",
        "This cash award has no reward amount recorded — refusing to pay it.",
      );
    }
    // Fast, clean refusal before any write; the post-increment check below is
    // the authoritative race guard.
    if (pool.accruedCents - pool.paidCents < award.rewardCents) {
      throw new RankAwardError(
        "pool_short",
        `The rank pool covers ${pool.accruedCents - pool.paidCents}c of this ${award.rewardCents}c award — it will clear once more registrations accrue.`,
      );
    }
  }

  // ---- claim the transition atomically (FLAGGED only) ----------------------
  const claim = await client.rankAward.updateMany({
    where: { id: awardId, status: "FLAGGED" },
    data:
      rule.money === "pool-pay"
        ? { status: rule.next, paidAt: new Date() }
        : { status: rule.next },
  });
  if (claim.count === 0) {
    const fresh = await client.rankAward.findUnique({
      where: { id: awardId },
      select: { status: true },
    });
    if (!fresh) throw new RankAwardError("not_found", "Rank award not found.");
    throw new RankAwardError(
      "invalid_transition",
      "This award was just changed by someone else. Reload and try again.",
    );
  }

  if (rule.money !== "pool-pay") {
    return {
      status: rule.next,
      paidCents: null,
      poolAvailableCents: pool.accruedCents - pool.paidCents,
    };
  }

  // ---- pay from the pool: identical shape to the automatic path -----------
  const rewardCents = award.rewardCents as number; // guarded non-null above
  const description = `Associate rank ${award.rankId} milestone - admin clear`;
  const idempotencyKey = `rank:${award.userId}:associate:${award.rankId}`;

  await client.commission.create({
    data: {
      userId: award.userId,
      type: "RANK_MILESTONE",
      amountCents: rewardCents,
      status: "PAID",
      pool: "RANK",
      refType: "RANK_AWARD",
      refId: award.id,
      description,
      idempotencyKey,
    },
  });

  await creditWallet(client, {
    userId: award.userId,
    amountCents: rewardCents,
    sourceUserId: null, // pool-funded: no single member caused it
    refType: "RANK_AWARD",
    refId: award.id,
    idempotencyKey,
    description,
  });

  // Increment FIRST (this locks the pool row), then verify the invariant:
  // a concurrent automatic settlement racing us would otherwise be able to
  // take the pool negative between our check above and this write.
  const after = await client.bonusPool.update({
    where: { id: pool.id },
    data: { paidCents: { increment: rewardCents } },
    select: { accruedCents: true, paidCents: true },
  });
  if (after.paidCents > after.accruedCents) {
    throw new RankAwardError(
      "pool_short",
      "The rank pool was exhausted by a concurrent settlement. Reload and try again.",
    );
  }

  await client.poolLedgerEntry.create({
    data: {
      poolId: pool.id,
      kind: "RANK",
      entryType: "PAYOUT",
      amountCents: rewardCents,
      // Pool balance means AVAILABLE (accrued − paid) for every entry type.
      balanceAfterCents: after.accruedCents - after.paidCents,
      refType: "RANK_AWARD",
      refId: award.id,
    },
  });

  return {
    status: rule.next,
    paidCents: rewardCents,
    poolAvailableCents: after.accruedCents - after.paidCents,
  };
}
