import type { Prisma } from "@/lib/generated/prisma/client";
import type { PayoutStatus } from "@/lib/generated/prisma/enums";
import { PayoutError, payoutTransition, type PayoutAction } from "./state";

/**
 * GTHubX — admin action on one payout (Phase 6c).
 *
 * Each transition is CLAIMED with a conditional `updateMany` whose WHERE
 * carries the expected current status, so two admins racing on the same
 * payout can never both succeed: the second claim matches 0 rows and gets
 * `invalid_transition`. The rules themselves (what may follow what, and
 * whether money moves) come from the pure matrix in `state.ts`.
 *
 * Money effects, all inside the caller's transaction:
 *   REJECT  -> wallet credit + ledger `CREDIT/REFUND` key `payout:{id}:refund`
 *              (the hold's debit already happened at request time).
 *   APPROVE / MARK_PAID -> status and timestamps only; the balance never
 *              moves — PAID only records that funds were delivered externally.
 */
export async function actOnPayout(input: {
  client: Prisma.TransactionClient;
  payoutId: string;
  action: PayoutAction;
  adminId: string;
}): Promise<{ status: PayoutStatus; refundCents: number | null }> {
  const { client, payoutId, action, adminId } = input;

  const payout = await client.payout.findUnique({ where: { id: payoutId } });
  if (!payout) {
    throw new PayoutError("not_found", "Payout not found.");
  }

  const rule = payoutTransition(payout.status, action);
  if (!rule.allowed) {
    throw new PayoutError("invalid_transition", rule.reason);
  }

  // ---- claim the transition atomically -------------------------------------
  const claim = await client.payout.updateMany({
    where:
      action === "REJECT"
        ? // Rejecting is legal from either live status, so the claim matches both.
          { id: payoutId, status: { in: ["REQUESTED", "APPROVED"] } }
        : // Approve claims REQUESTED; MarkPaid claims APPROVED. (The rule check
          // above already proved `payout.status` is this value.)
          { id: payoutId, status: payout.status },
    data:
      action === "APPROVE"
        ? { status: "APPROVED", approvedById: adminId, approvedAt: new Date() }
        : action === "REJECT"
          ? { status: "REJECTED" }
          : { status: "PAID", paidAt: new Date() },
  });
  if (claim.count === 0) {
    // Someone changed the status between our read and our claim.
    const fresh = await client.payout.findUnique({
      where: { id: payoutId },
      select: { status: true },
    });
    if (!fresh) throw new PayoutError("not_found", "Payout not found.");
    const retry = payoutTransition(fresh.status, action);
    throw new PayoutError(
      "invalid_transition",
      retry.allowed
        ? "This payout was just changed by someone else. Reload and try again."
        : retry.reason,
    );
  }

  // ---- money effect (REJECT only) ------------------------------------------
  if (action === "REJECT") {
    const wallet = await client.wallet.update({
      where: { userId: payout.userId },
      data: { balanceCents: { increment: payout.amountCents } },
      select: { balanceCents: true, currency: true },
    });

    await client.ledgerEntry.create({
      data: {
        userId: payout.userId,
        direction: "CREDIT",
        type: "REFUND",
        amountCents: payout.amountCents,
        balanceAfterCents: wallet.balanceCents,
        currency: wallet.currency,
        refType: "PAYOUT",
        refId: payout.id,
        description: "Payout rejected — held funds returned to your wallet",
        idempotencyKey: `payout:${payout.id}:refund`,
      },
    });

    return { status: "REJECTED", refundCents: payout.amountCents };
  }

  return { status: rule.next, refundCents: null };
}
