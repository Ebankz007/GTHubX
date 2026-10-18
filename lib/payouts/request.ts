import type { Prisma } from "@/lib/generated/prisma/client";
import type { PayoutMethod } from "@/lib/generated/prisma/enums";
import { PayoutError } from "./state";

/**
 * GTHubX — request a payout (Phase 6c).
 *
 * One transaction, three writes, in this order:
 *
 *   1. the `Payout` row is created (REQUESTED) — it gets the id that the
 *      ledger rows will reference;
 *   2. the wallet is debited with a CONDITIONAL update
 *      (`balanceCents >= amount` in the WHERE), so two concurrent requests
 *      can never drive the balance negative — the loser's count is 0 and the
 *      whole transaction rolls back, including the Payout row from step 1;
 *   3. the append-only ledger records the hold:
 *      `DEBIT/WITHDRAWAL`, `refType: "PAYOUT"`, key `payout:{id}:hold`.
 *
 * The hold-at-request model (vs debit-on-approve) is deliberate: funds leave
 * `balanceCents` the moment the request is accepted, so the balance always
 * means FREE cash and an overdraft cannot be constructed by racing requests.
 * A rejection later writes the compensating `CREDIT/REFUND`.
 *
 * **The identity gate lives here, not in the route.** `lib/dashboard`'s
 * verification page has told members since Phase 4 that verification is
 * "required before any withdrawal can be processed", and until now nothing
 * enforced it. Putting the check in the domain function rather than the HTTP
 * handler means no future caller — a batch tool, an admin impersonation, a
 * second route — can skip it. It runs before the Payout row is created, so a
 * refused request leaves no trace of a withdrawal that never was.
 */
export async function requestPayout(input: {
  client: Prisma.TransactionClient;
  userId: string;
  amountCents: number;
  method: PayoutMethod;
  destination: string;
  details?: string;
}): Promise<{ payoutId: string; balanceAfterCents: number }> {
  const { client, userId, amountCents, method, destination, details } = input;

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true },
  });
  if (!user) {
    throw new PayoutError("not_found", "Account not found.");
  }
  if (user.kycStatus !== "VERIFIED") {
    throw new PayoutError(
      "kyc_required",
      "Verify your identity before requesting a payout.",
    );
  }

  const payout = await client.payout.create({
    data: {
      userId,
      type: "WITHDRAWAL",
      amountCents,
      method,
      destination,
      details: details ? details : null,
      status: "REQUESTED",
    },
  });

  // Conditional debit: the guard lives in the WHERE clause, not in a read
  // that a concurrent transaction could invalidate.
  const debited = await client.wallet.updateMany({
    where: { userId, balanceCents: { gte: amountCents } },
    data: { balanceCents: { decrement: amountCents } },
  });
  if (debited.count === 0) {
    // Missing wallet row counts as balance 0 — same outcome, same message.
    throw new PayoutError(
      "insufficient_balance",
      "Your wallet balance is too low for this payout.",
    );
  }

  const wallet = await client.wallet.findUniqueOrThrow({
    where: { userId },
    select: { balanceCents: true, currency: true },
  });

  await client.ledgerEntry.create({
    data: {
      userId,
      direction: "DEBIT",
      type: "WITHDRAWAL",
      amountCents,
      balanceAfterCents: wallet.balanceCents,
      currency: wallet.currency,
      refType: "PAYOUT",
      refId: payout.id,
      description: `Payout requested via ${method.replace(/_/g, " ").toLowerCase()}`,
      idempotencyKey: `payout:${payout.id}:hold`,
    },
  });

  return { payoutId: payout.id, balanceAfterCents: wallet.balanceCents };
}
