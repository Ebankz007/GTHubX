/**
 * Shared wallet primitives for settlement (Phase 6b).
 *
 * Moved out of `registration.ts` so rank-milestone payouts and registration
 * commissions can share one credit path without importing each other — the
 * rank writer is called *by* registration settlement, so keeping the credit
 * helper there would have made the modules circular.
 *
 * Every credit is append-only and idempotent: the unique `idempotencyKey` on
 * `LedgerEntry` makes a retried settlement unable to pay twice, even if the
 * caller's own guard is somehow bypassed.
 */
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** A transaction client, or the root client for non-transactional use. */
export type SettleClient = Prisma.TransactionClient | typeof prisma;

/** Credit a member's wallet and record it in the immutable ledger. */
export async function creditWallet(
  client: SettleClient,
  args: {
    readonly userId: string;
    readonly amountCents: number;
    /** Whose action caused this credit; null when it is pool-funded. */
    readonly sourceUserId: string | null;
    readonly refType: string;
    readonly refId: string;
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
      // TransactionType has no RANK value; the milestone's meaning lives in
      // refType/refId (RANK_AWARD) and in the Commission row written alongside.
      type: "COMMISSION",
      amountCents: args.amountCents,
      balanceAfterCents: balanceCents,
      currency: "USD",
      sourceUserId: args.sourceUserId,
      refType: args.refType,
      refId: args.refId,
      description: args.description,
      idempotencyKey: args.idempotencyKey,
    },
  });
}
