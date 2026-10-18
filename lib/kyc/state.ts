import type { KycStatus } from "@/lib/generated/prisma/enums";

/**
 * GTHubX — the KYC state machine (Phase 7c).
 *
 * Two transitions exist, both leaving `PENDING`, and neither moves money:
 *
 *   NOT_STARTED --submit--> PENDING
 *   PENDING     --VERIFY--> VERIFIED
 *   PENDING     --REJECT--> REJECTED
 *   REJECTED    --submit--> PENDING   (resubmission is a first-class path, not
 *                                      a support ticket)
 *
 * VERIFIED is not terminal by fiat — nothing here forbids a future re-review —
 * but no action in this phase leaves it, and `canSubmit` refuses a verified
 * member rather than silently dropping them back into the queue.
 *
 * This module is the single source of the rules; `lib/kyc/submit.ts` and
 * `lib/kyc/review.ts` enforce them with conditional `updateMany` claims, so two
 * concurrent writers cannot both win. The loser sees a count of 0.
 */

/** Tuple (not `string[]`) so `z.enum(KYC_ACTIONS)` can consume it directly. */
export const KYC_ACTIONS = ["VERIFY", "REJECT"] as const;

export type KycAction = (typeof KYC_ACTIONS)[number];

export function isKycAction(value: unknown): value is KycAction {
  return (
    typeof value === "string" && (KYC_ACTIONS as readonly string[]).includes(value)
  );
}

export type KycTransition =
  | { allowed: true; next: KycStatus }
  | { allowed: false; reason: string };

/**
 * The complete decision matrix.
 *
 *   status       action   -> next
 *   PENDING      VERIFY   -> VERIFIED
 *   PENDING      REJECT   -> REJECTED
 *   NOT_STARTED  anything -> refused (nothing has been submitted)
 *   VERIFIED     anything -> refused (already verified)
 *   REJECTED     anything -> refused (the member must resubmit first)
 */
export function kycTransition(status: KycStatus, action: KycAction): KycTransition {
  if (status === "PENDING") {
    return { allowed: true, next: action === "VERIFY" ? "VERIFIED" : "REJECTED" };
  }
  if (status === "VERIFIED") {
    return { allowed: false, reason: "This member is already verified." };
  }
  if (status === "REJECTED") {
    return {
      allowed: false,
      reason: "This submission has already been rejected — the member must resubmit.",
    };
  }
  return {
    allowed: false,
    reason: "This member has not submitted anything to review.",
  };
}

/**
 * Whether a member may submit (or resubmit) right now.
 *
 * REJECTED is deliberately allowed: a rejection that could not be answered
 * would turn a correctable document problem into a dead end.
 */
export function canSubmit(
  status: KycStatus,
): { allowed: true } | { allowed: false; reason: string } {
  if (status === "PENDING") {
    return { allowed: false, reason: "Your submission is already in review." };
  }
  if (status === "VERIFIED") {
    return { allowed: false, reason: "Your identity is already verified." };
  }
  return { allowed: true };
}

/* ---------------------------------------------------------------- errors -- */

export type KycErrorCode = "not_found" | "invalid_transition" | "reason_required";

const KYC_ERROR_STATUS: Record<KycErrorCode, number> = {
  not_found: 404,
  invalid_transition: 409,
  reason_required: 400,
};

/** Thrown by the KYC writers; the routes map the code to an HTTP status. */
export class KycError extends Error {
  readonly code: KycErrorCode;

  constructor(code: KycErrorCode, message: string) {
    super(message);
    this.name = "KycError";
    this.code = code;
  }

  get status(): number {
    return KYC_ERROR_STATUS[this.code];
  }
}
