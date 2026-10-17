import type { PayoutStatus } from "@/lib/generated/prisma/enums";

/**
 * GTHubX — payout lifecycle rules (Phase 6c).
 *
 * The money model these rules implement:
 *
 *   REQUEST  -> debits the wallet immediately (a hold). The ledger row is
 *               `DEBIT/WITHDRAWAL` keyed `payout:{id}:hold`.
 *   REJECT   -> refunds the hold. The ledger row is `CREDIT/REFUND` keyed
 *               `payout:{id}:refund`.
 *   APPROVE  -> human review passes; NO money moves.
 *   PAID     -> records that the operator delivered funds externally;
 *               NO money moves (the hold already left the wallet).
 *
 * Consequence: `Wallet.balanceCents` always means FREE (spendable) cash, and
 * over-committing a balance is structurally impossible — the funds are gone
 * from the balance the moment the request is accepted, long before any human
 * sees it. PAID is terminal and irreversible; REJECTED is terminal too, but a
 * refund already returned the money, so no clawback exists.
 *
 * Concurrency: the writers in `lib/payouts/admin.ts` claim each transition
 * with a conditional `updateMany` (matching on the expected current status),
 * so two admins racing on the same payout can never both succeed — the loser
 * sees a count of 0 and gets `invalid_transition`. This module is the single
 * source of the rules; the DB claim is the enforcement.
 */

export type PayoutAction = "APPROVE" | "REJECT" | "MARK_PAID";

export const PAYOUT_ACTIONS: readonly PayoutAction[] = [
  "APPROVE",
  "REJECT",
  "MARK_PAID",
];

export function isPayoutAction(value: unknown): value is PayoutAction {
  return (
    typeof value === "string" && (PAYOUT_ACTIONS as readonly string[]).includes(value)
  );
}

export type PayoutTransition =
  | { allowed: true; next: PayoutStatus; money: "none" | "refund" }
  | { allowed: false; reason: string };

/**
 * The complete transition matrix for a payout.
 *
 *   status    action     -> next / money effect
 *   REQUESTED APPROVE    -> APPROVED / none
 *   REQUESTED REJECT     -> REJECTED / refund
 *   APPROVED  REJECT     -> REJECTED / refund   (changing your mind before
 *                                               delivery is legal)
 *   APPROVED  MARK_PAID  -> PAID / none         (the only route to PAID —
 *                                               review cannot be skipped)
 *   PAID      anything   -> refused ("already paid")
 *   REJECTED  anything   -> refused (both terminal states are final)
 */
export function payoutTransition(
  status: PayoutStatus,
  action: PayoutAction,
): PayoutTransition {
  if (status === "PAID") {
    return { allowed: false, reason: "This payout has already been paid." };
  }
  if (status === "REJECTED") {
    return { allowed: false, reason: "This payout has been rejected." };
  }

  if (action === "APPROVE") {
    if (status !== "REQUESTED") {
      return {
        allowed: false,
        reason: "Only a requested payout can be approved.",
      };
    }
    return { allowed: true, next: "APPROVED", money: "none" };
  }

  if (action === "REJECT") {
    // REQUESTED and APPROVED both fall through here (PAID/REJECTED returned above).
    return { allowed: true, next: "REJECTED", money: "refund" };
  }

  // MARK_PAID — the only action that is gated on prior review.
  if (status !== "APPROVED") {
    return {
      allowed: false,
      reason: "Approve the payout before marking it paid.",
    };
  }
  return { allowed: true, next: "PAID", money: "none" };
}

/* ---------------------------------------------------------------- errors -- */

export type PayoutErrorCode =
  | "not_found"
  | "invalid_transition"
  | "insufficient_balance";

const PAYOUT_ERROR_STATUS: Record<PayoutErrorCode, number> = {
  not_found: 404,
  invalid_transition: 409,
  insufficient_balance: 400,
};

/** Thrown by the payout writers; the routes map the code to an HTTP status. */
export class PayoutError extends Error {
  readonly code: PayoutErrorCode;

  constructor(code: PayoutErrorCode, message: string) {
    super(message);
    this.name = "PayoutError";
    this.code = code;
  }

  /** HTTP status a route should answer with for this code. */
  get status(): number {
    return PAYOUT_ERROR_STATUS[this.code];
  }
}
