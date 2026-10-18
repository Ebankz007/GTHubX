import type { Prisma } from "@/lib/generated/prisma/client";
import type { KycStatus } from "@/lib/generated/prisma/enums";
import { KYC_LIMITS } from "./policy";
import { KycError, kycTransition, type KycAction } from "./state";

/**
 * GTHubX — decide a KYC submission (Phase 7c).
 *
 * The reviewer's half of the pipeline. Rules live in `./state.ts`; this module
 * performs them and returns what happened, so the route can write an audit row
 * **inside the same transaction** (an approval that commits without its trail is
 * exactly what the trail exists to catch).
 *
 * A rejection must carry a reason of at least `KYC_LIMITS.reasonMin`
 * characters. A rejection a member cannot act on is a support ticket, and this
 * platform already has those.
 *
 * The write is claimed conditionally on `status: "PENDING"`: two reviewers
 * opening the same queue and deciding the same submission is the normal case,
 * not an exotic one, and the second must be told rather than allowed to
 * overwrite the first.
 *
 * No money moves here. KYC gates the *ability* to withdraw; the payout machine
 * is unchanged and still debits on request.
 */

export type KycDecisionResult = {
  userId: string;
  /** Status before the decision — the audit row's `before`. */
  previous: KycStatus;
  /** Status after it — the audit row's `after`, and the member's new state. */
  status: KycStatus;
};

export async function decideKyc(input: {
  client: Prisma.TransactionClient;
  profileId: string;
  action: KycAction;
  reason?: string | null;
  adminId: string;
}): Promise<KycDecisionResult> {
  const { client, profileId, action, adminId } = input;

  const profile = await client.kycProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true, status: true },
  });
  if (!profile) {
    throw new KycError("not_found", "Submission not found.");
  }

  const transition = kycTransition(profile.status, action);
  if (!transition.allowed) {
    throw new KycError("invalid_transition", transition.reason);
  }

  const reason = input.reason?.trim() ?? "";
  if (action === "REJECT" && reason.length < KYC_LIMITS.reasonMin) {
    throw new KycError(
      "reason_required",
      "Give the member a reason they can act on (at least a few words).",
    );
  }

  const claimed = await client.kycProfile.updateMany({
    where: { id: profileId, status: "PENDING" },
    data: {
      status: transition.next,
      reviewedAt: new Date(),
      reviewedById: adminId,
      // A verification clears any reason left over from an earlier rejection.
      rejectionReason: action === "REJECT" ? reason : null,
    },
  });
  if (claimed.count === 0) {
    throw new KycError(
      "invalid_transition",
      "Another reviewer just decided this submission.",
    );
  }

  await client.user.update({
    where: { id: profile.userId },
    data: { kycStatus: transition.next },
  });

  return {
    userId: profile.userId,
    previous: profile.status,
    status: transition.next,
  };
}
