import type { Prisma } from "@/lib/generated/prisma/client";
import { KycError, canSubmit } from "./state";

/**
 * GTHubX — submit identity details for review (Phase 7c).
 *
 * One transaction, two writes: the `KycProfile` (the submission) and the
 * denormalised `User.kycStatus` that the rest of the app gates on. They move
 * together or not at all — a profile saying PENDING with a user saying
 * NOT_STARTED is a member whose verification page contradicts the withdrawal
 * gate.
 *
 * Two ways to lose the race, both handled:
 *
 *  - the profile already exists and is PENDING or VERIFIED: refused up front,
 *    because overwriting a submission a reviewer is holding (or has approved)
 *    would be silent data loss;
 *  - two submissions arrive at once on a NOT_STARTED/REJECTED profile: the
 *    conditional `updateMany` matches only the old status, so exactly one wins
 *    and the other gets `invalid_transition`.
 *
 * `documents` is left null. Nothing uploads files yet, and writing a
 * placeholder object there would put a fake answer where the reviewer expects
 * evidence. See `lib/kyc/policy.ts` for why the bytes are not collected.
 */

export type KycFacts = {
  legalName: string;
  dateOfBirth: Date;
  country: string;
  address: string;
  idType: string;
  idNumber: string;
};

export type KycSubmissionResult = {
  profileId: string;
  status: "PENDING";
};

/** Statuses a profile may be overwritten from. Anything else is in flight. */
const RESUBMITTABLE = ["NOT_STARTED", "REJECTED"] as const;

export async function submitKyc(input: {
  client: Prisma.TransactionClient;
  userId: string;
  facts: KycFacts;
}): Promise<KycSubmissionResult> {
  const { client, userId, facts } = input;

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!user) {
    throw new KycError("not_found", "Account not found.");
  }
  if (user.status === "SUSPENDED") {
    throw new KycError(
      "invalid_transition",
      "This account is suspended. Contact support before resubmitting.",
    );
  }

  const existing = await client.kycProfile.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });

  const now = new Date();

  if (existing) {
    const gate = canSubmit(existing.status);
    if (!gate.allowed) {
      throw new KycError("invalid_transition", gate.reason);
    }

    const claimed = await client.kycProfile.updateMany({
      where: { id: existing.id, status: { in: [...RESUBMITTABLE] } },
      data: {
        ...facts,
        status: "PENDING",
        submittedAt: now,
        // A resubmission is a new decision to make: the previous reviewer's
        // verdict and reason must not linger next to the new evidence.
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
      },
    });
    if (claimed.count === 0) {
      throw new KycError("invalid_transition", "Your submission is already in review.");
    }

    await client.user.update({
      where: { id: userId },
      data: { kycStatus: "PENDING" },
    });

    return { profileId: existing.id, status: "PENDING" };
  }

  let profileId: string;
  try {
    const created = await client.kycProfile.create({
      data: { userId, ...facts, status: "PENDING", submittedAt: now },
      select: { id: true },
    });
    profileId = created.id;
  } catch (error) {
    // `userId` is unique on KycProfile: a concurrent first submission lost.
    if ((error as { code?: string }).code === "P2002") {
      throw new KycError("invalid_transition", "Your submission is already in review.");
    }
    throw error;
  }

  await client.user.update({
    where: { id: userId },
    data: { kycStatus: "PENDING" },
  });

  return { profileId, status: "PENDING" };
}
