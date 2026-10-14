/**
 * GTHubX Compensation Engine — Global Constants
 *
 * Ported from Aglotrends `packages/engine` (2026-10-14). Money is integer cents
 * everywhere; percentages are integer basis points (1% = 100 bps, 100% = 10_000
 * bps). Never use floats for money.
 *
 * NOTE — the **plan is GTHubX's own** (Henry, 2026-10-14): registration fee $50 +
 * $5 per-payment platform fee, with the agreed sharing formula applied to the $50
 * base. Rank milestone rewards are **absolute amounts, not fee-derived**. Every
 * function that consumes these values also accepts an override argument.
 */

/** One-time fee paid by every new member on signup. $50.00. */
export const REGISTRATION_FEE_CENTS = 5000;

/**
 * Platform transaction fee charged on EVERY inbound gateway payment. $5.00.
 *
 * **Per-payment, not per-registration.** It applies to every gateway charge —
 * registration, wallet deposits, package payments. This is PLATFORM REVENUE,
 * not compensation. It is carved out of the gross charge BEFORE the
 * compensation split runs, so `REGISTRATION_FEE_CENTS` (the $50 base that
 * drives the 45/55 allocation) is untouched. A registration therefore charges
 * $55.00: $50.00 into the plan, $5.00 to the operator wallet.
 */
export const PLATFORM_FEE_CENTS = 500;

/** The gross amount charged for a registration: $50.00 + $5.00. */
export const REGISTRATION_GROSS_CENTS = REGISTRATION_FEE_CENTS + PLATFORM_FEE_CENTS;

/** Minimum a client must fund into their OWN broker account to activate copy-trading. Not revenue. */
export const MIN_FUNDING_CENTS = 5000;

/** Max direct placements per matrix position (3x3 matrix). */
export const MATRIX_WIDTH = 3;

/** Max levels wide/deep from a sponsor before overflow. */
export const MATRIX_DEPTH = 3;

/** Generation bonus applies to downline levels 2 through 6. */
export const GENERATION_MIN = 2;
export const GENERATION_MAX = 6;

/** No single leg may contribute more than 40% of team volume. */
export const MAX_LEG_CONTRIBUTION_BPS = 4000;

/** Top-level split of the registration fee. Sums to 10_000 bps. */
export const FEE_SPLIT_BPS = {
  companyReserve: 4500, // 45% -> $22.50 on $50
  communityPool: 5500, // 55% -> $27.50 on $50
} as const;

/**
 * The community pool ($27.50) split into four sub-pools. These are percentages
 * OF THE FEE (30% of $50 = $15.00), and sum to the community pool
 * (30 + 10 + 8 + 7 = 55% of the fee).
 */
export const COMMUNITY_POOL_SPLIT_BPS = {
  directReferral: 3000, // 30% -> $15.00
  generation: 1000, // 10% -> $5.00
  rank: 800, //  8% -> $4.00
  leadership: 700, //  7% -> $3.50
} as const;

/** Generation override rates, as % of fee. Sums to 1000 bps (10%). */
export const GENERATION_RATE_BPS = {
  2: 400, // 4.0% -> $2.00
  3: 200, // 2.0% -> $1.00
  4: 150, // 1.5% -> $0.75
  5: 150, // 1.5% -> $0.75
  6: 100, // 1.0% -> $0.50
} as const;

/** Realized trading-profit split. Sums to 10_000 bps. */
export const TRADING_PROFIT_SPLIT_BPS = {
  client: 6000, // 60%
  sponsor: 1000, // 10%
  company: 3000, // 30%
} as const;

/** Associate Rank milestones. Team volume is measured in downline members. */
export interface AssociateRankDef {
  readonly rankId: number;
  readonly minPersonalReferrals: number;
  readonly minTeamVolume: number;
  readonly rewardCents: number;
}

export const ASSOCIATE_RANKS: readonly AssociateRankDef[] = [
  { rankId: 1, minPersonalReferrals: 3, minTeamVolume: 12, rewardCents: 1400 },
  { rankId: 2, minPersonalReferrals: 7, minTeamVolume: 40, rewardCents: 3200 },
  { rankId: 3, minPersonalReferrals: 15, minTeamVolume: 130, rewardCents: 10000 },
  { rankId: 4, minPersonalReferrals: 25, minTeamVolume: 700, rewardCents: 28000 },
  { rankId: 5, minPersonalReferrals: 35, minTeamVolume: 2500, rewardCents: 80000 },
  { rankId: 6, minPersonalReferrals: 60, minTeamVolume: 6000, rewardCents: 240000 },
  { rankId: 7, minPersonalReferrals: 100, minTeamVolume: 17000, rewardCents: 1000000 },
  { rankId: 8, minPersonalReferrals: 150, minTeamVolume: 60000, rewardCents: 2000000 },
];

/** Leadership Ranks. Rewards are NON-CASH SKUs, not currency amounts. */
export interface LeadershipRankDef {
  readonly rankId: number;
  readonly name: string;
  readonly requiredAssociateRank: number;
  readonly minLegs: number;
  readonly minTeamMembers: number;
  readonly rewardSku: string;
}

export const LEADERSHIP_RANKS: readonly LeadershipRankDef[] = [
  { rankId: 1, name: "Bronze Leader", requiredAssociateRank: 3, minLegs: 2, minTeamMembers: 3, rewardSku: "SMARTPHONE" },
  { rankId: 2, name: "Silver Leader", requiredAssociateRank: 4, minLegs: 2, minTeamMembers: 3, rewardSku: "LAPTOP" },
  { rankId: 3, name: "Gold Leader", requiredAssociateRank: 5, minLegs: 2, minTeamMembers: 3, rewardSku: "LUXURY_WATCH" },
  { rankId: 4, name: "Platinum Leader", requiredAssociateRank: 6, minLegs: 2, minTeamMembers: 3, rewardSku: "INTERNATIONAL_TRIP" },
  { rankId: 5, name: "Diamond Leader", requiredAssociateRank: 7, minLegs: 2, minTeamMembers: 3, rewardSku: "LUXURY_VEHICLE" },
  { rankId: 6, name: "Crown Diamond", requiredAssociateRank: 8, minLegs: 2, minTeamMembers: 3, rewardSku: "HOME_APARTMENT" },
];

/** Compression window: how far up the tree a skipped payout may travel. */
export const COMPRESSION_STOP_AT_GEN = 6;

/** Ledger / wallet credit types emitted by the engine. */
export const CREDIT_TYPE = {
  directReferral: "DIRECT_REFERRAL_BONUS",
  generation: (gen: number) => `GENERATION_BONUS_GEN${gen}`,
  rankMilestone: "RANK_MILESTONE",
  sponsorOverride: "SPONSOR_OVERRIDE",
  tradingProfitRetained: "TRADING_PROFIT_RETAINED",
} as const;

/** Company revenue types. */
export const REVENUE_TYPE = {
  registrationReserve: "REGISTRATION_OPERATING_RESERVE",
  tradingPerformanceShare: "TRADING_PERFORMANCE_SHARE",
} as const;
