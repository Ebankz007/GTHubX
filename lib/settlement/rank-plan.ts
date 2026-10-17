/**
 * Pure rank-milestone planning (Phase 6b).
 *
 * Two responsibilities, both database-free so they can be unit-tested:
 *
 *   planRankAwards    - walk the settling member's upline chain and ask the
 *                       engine who newly qualifies, in evaluation order.
 *   applyPoolBudget   - decide which of those awards the rank pool can
 *                       actually fund *before* anything is written.
 *
 * Policy encoded here (engine contract, not invented locally):
 *   - Only the HIGHEST newly-qualified rank is awarded per member per pass;
 *     the engine does not back-pay milestones skipped by a jump. If Henry
 *     wants stepwise payout that is a change to `lib/engine/ranks.ts`.
 *   - Evaluation order is nearest-to-the-new-member first (chain walk), and
 *     the pool is spent in that order: when the pool cannot cover everyone,
 *     the most proximate qualifier is paid and the rest are flagged.
 *   - A leadership milestone is a non-cash SKU and never consumes the pool.
 *   - A FLAGGED award still promotes the member: the qualification is a fact,
 *     payment is a separate state. Re-evaluation cannot re-award it (unique
 *     (userId, kind, rankId)), so the flag must later be cleared by an admin.
 */
import {
  evaluateAssociateRank,
  evaluateLeadershipRank,
  getUplineChain,
  type MemberNode,
  type NetworkIndex,
} from "@/lib/engine";

export type PlannedRankAward = {
  readonly userId: string;
  readonly kind: "ASSOCIATE" | "LEADERSHIP";
  readonly rankId: number;
  /** Cash value for ASSOCIATE milestones. */
  readonly rewardCents: number | null;
  /** Non-cash reward for LEADERSHIP milestones. */
  readonly rewardSku: string | null;
};

export type RankPromotion = {
  readonly userId: string;
  readonly highestAssociateRank: number;
  readonly highestLeadershipRank: number;
};

export type RankPlan = {
  readonly awards: readonly PlannedRankAward[];
  readonly promotions: readonly RankPromotion[];
  /** How many chain members were evaluated (diagnostics). */
  readonly evaluatedCount: number;
};

/**
 * Plan rank awards triggered by a new member joining the tree.
 *
 * Candidates are the FULL upline chain (member → sponsor → ... → root).
 * Note this deliberately exceeds the generation-bonus window: that window
 * routes *payouts*, while rank qualification is a fact about tree shape.
 */
export function planRankAwards(args: {
  readonly index: NetworkIndex;
  readonly newMemberId: string;
}): RankPlan {
  const chain = getUplineChain(args.index, args.newMemberId);

  // Working copy of the index: a member may cross an associate threshold and
  // a leadership gate in the same pass, and the leadership gate reads
  // `highestAssociateRank`. Promotions decided here must therefore be visible
  // to the evaluations that follow within this same pass.
  const nodes = new Map<string, MemberNode>();
  for (const [id, node] of args.index.byId) nodes.set(id, { ...node });
  const working: NetworkIndex = { byId: nodes, children: args.index.children };

  const awards: PlannedRankAward[] = [];
  const promotions = new Map<string, { associate: number; leadership: number }>();

  const promotionFor = (member: MemberNode): { associate: number; leadership: number } => {
    let entry = promotions.get(member.id);
    if (!entry) {
      entry = {
        associate: member.highestAssociateRank,
        leadership: member.highestLeadershipRank,
      };
      promotions.set(member.id, entry);
    }
    return entry;
  };

  for (const member of chain) {
    const associate = evaluateAssociateRank(working, member.id);
    if (associate) {
      awards.push({
        userId: member.id,
        kind: "ASSOCIATE",
        rankId: associate.rankId,
        rewardCents: associate.rewardCents,
        rewardSku: null,
      });
      promotionFor(member).associate = associate.rankId;
      const current = nodes.get(member.id);
      if (current) {
        nodes.set(member.id, { ...current, highestAssociateRank: associate.rankId });
      }
    }

    const leadership = evaluateLeadershipRank(working, member.id);
    if (leadership) {
      awards.push({
        userId: member.id,
        kind: "LEADERSHIP",
        rankId: leadership.rankId,
        rewardCents: null,
        rewardSku: leadership.rewardSku,
      });
      promotionFor(member).leadership = leadership.rankId;
      const current = nodes.get(member.id);
      if (current) {
        nodes.set(member.id, { ...current, highestLeadershipRank: leadership.rankId });
      }
    }
  }

  return {
    awards,
    promotions: [...promotions.entries()].map(([userId, entry]) => ({
      userId,
      highestAssociateRank: entry.associate,
      highestLeadershipRank: entry.leadership,
    })),
    evaluatedCount: chain.length,
  };
}

export type PoolBudget = {
  /** Cash awards the pool can fund right now, in evaluation order. */
  readonly payable: readonly PlannedRankAward[];
  /** Cash awards the pool cannot fund — recorded, never paid. */
  readonly flagged: readonly PlannedRankAward[];
  /** Leadership SKUs — fulfilled without money, so never budget-limited. */
  readonly skus: readonly PlannedRankAward[];
  readonly spentCents: number;
};

/**
 * Split planned awards against the pool's available balance.
 *
 * Pure so both branches are unit-tested: available is `accrued - paid`, and
 * awards are consumed nearest-first. Money never moves on a promise — if the
 * pool cannot cover a milestone, the caller records it as FLAGGED.
 */
export function applyPoolBudget(
  awards: readonly PlannedRankAward[],
  availableCents: number,
): PoolBudget {
  const payable: PlannedRankAward[] = [];
  const flagged: PlannedRankAward[] = [];
  const skus: PlannedRankAward[] = [];
  let remaining = Math.max(0, availableCents);
  let spent = 0;

  for (const award of awards) {
    if (award.kind === "LEADERSHIP") {
      skus.push(award);
      continue;
    }
    const cost = award.rewardCents ?? 0;
    if (cost <= remaining) {
      payable.push(award);
      remaining -= cost;
      spent += cost;
    } else {
      flagged.push(award);
    }
  }

  return { payable, flagged, skus, spentCents: spent };
}
