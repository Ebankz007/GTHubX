/**
 * Registration settlement — the pure planning half.
 *
 * No database, no clock, no IO: this module turns an engine network index into
 * a set of amounts and recipients. Its writer counterpart lives in
 * `./registration.ts` and is the only thing here that touches persistence —
 * which is exactly why the planner can be unit-tested without a database
 * client existing at all.
 */
import {
  REGISTRATION_FEE_CENTS,
  allocateRegistrationFee,
  directReferralBonusCents,
  leadershipPoolContributionCents,
  rankPoolContributionCents,
  resolveDirectReferralRecipient,
  resolveGenerationRecipients,
  type FeeAllocation,
  type NetworkIndex,
} from "@/lib/engine";

export type RegistrationPlan = {
  readonly feeCents: number;
  readonly allocation: FeeAllocation;
  /** Direct referral credit, or null when the tree has no qualified upline. */
  readonly direct: { readonly recipientId: string; readonly amountCents: number } | null;
  readonly generations: ReadonlyArray<{
    readonly recipientId: string;
    readonly generation: number;
    readonly amountCents: number;
  }>;
  readonly rankPoolCents: number;
  readonly leadershipPoolCents: number;
};

/**
 * Plan the settlement of one registration.
 *
 * Invariant: direct + generation + rank + leadership equals the community pool
 * to the cent when the tree is deep enough to receive every generation. A
 * shallower tree simply has fewer recipients; the unclaimed generation share
 * is visible as `allocation.generationPoolCents` minus what was credited,
 * rather than silently vanishing or being redistributed — the plan does not
 * say where it goes, so we record it and invent no policy.
 */
export function planRegistrationSettlement(args: {
  readonly index: NetworkIndex;
  readonly newMemberId: string;
  readonly feeCents?: number;
}): RegistrationPlan {
  const feeCents = args.feeCents ?? REGISTRATION_FEE_CENTS;
  const allocation = allocateRegistrationFee(feeCents);

  const directRecipient = resolveDirectReferralRecipient(args.index, args.newMemberId);
  const direct = directRecipient
    ? { recipientId: directRecipient.id, amountCents: directReferralBonusCents(feeCents) }
    : null;

  const generations = resolveGenerationRecipients(args.index, args.newMemberId, feeCents).map(
    (credit, i) => ({
      recipientId: credit.memberId,
      generation: i + 2,
      amountCents: credit.amountCents,
    }),
  );

  return {
    feeCents,
    allocation,
    direct,
    generations,
    rankPoolCents: rankPoolContributionCents(feeCents),
    leadershipPoolCents: leadershipPoolContributionCents(feeCents),
  };
}
