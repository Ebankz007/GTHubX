/**
 * Rank milestone settlement — applies a pure `RankPlan` as durable rows
 * (Phase 6b). Runs INSIDE the caller's registration-settlement transaction:
 * either a confirmed payment settles, its commissions credit, its pools accrue
 * AND the rank awards it triggered all commit — or none of it does.
 *
 * Money discipline:
 *   - Associate cash is paid only from the RANK pool's available balance
 *     (accrued − paid). Shortfall → RankAward FLAGGED, zero rows moved.
 *   - The pool debit, its PoolLedgerEntry (PAYOUT, balance = available after)
 *     and the wallet credit commit together with the award row.
 *   - Leadership milestones are SKUs: recorded PENDING, no money, no pool.
 *   - Existing awards are skipped (check-then-insert), with the DB unique
 *     (userId, kind, rankId) as the independent backstop against double-pay.
 *
 * `User.highestAssociateRank` / `highestLeadershipRank` are written for every
 * fresh award including FLAGGED ones: the qualification is a fact, payment is
 * a separate state. That also makes re-evaluation a no-op for that rank.
 */
import type { NetworkIndex } from "@/lib/engine";
import { applyPoolBudget, planRankAwards, type PlannedRankAward } from "./rank-plan";
import { creditWallet, type SettleClient } from "./wallet";

export type RankAwardsResult = {
  readonly evaluatedCount: number;
  /** Cash milestones paid from the pool. */
  readonly paid: readonly { userId: string; rankId: number; rewardCents: number }[];
  /** Cash milestones the pool could not fund — recorded, not paid. */
  readonly flagged: readonly { userId: string; rankId: number }[];
  /** Leadership SKU milestones recorded for fulfillment. */
  readonly skus: readonly { userId: string; rankId: number; rewardSku: string }[];
  /** Total actually paid out of the pool in this pass. */
  readonly paidCents: number;
  readonly poolAccruedCents: number;
  readonly poolPaidCents: number;
  readonly poolAvailableCents: number;
};

function keyFor(award: PlannedRankAward): string {
  return `${award.userId}:${award.kind}:${award.rankId}`;
}

/**
 * Evaluate and persist rank milestones triggered by `newMemberId` joining the
 * tree. Call AFTER the registration's pool accruals, so a milestone can draw
 * on the very registration that triggered it.
 */
export async function settleRankAwards(args: {
  readonly client: SettleClient;
  readonly index: NetworkIndex;
  readonly newMemberId: string;
  readonly paymentId: string;
}): Promise<RankAwardsResult> {
  const { client, paymentId } = args;

  const plan = planRankAwards({ index: args.index, newMemberId: args.newMemberId });

  const poolState = async () => {
    const pool = await client.bonusPool.findUnique({
      where: { kind: "RANK" },
      select: { accruedCents: true, paidCents: true },
    });
    const accruedCents = pool?.accruedCents ?? 0;
    const paidCents = pool?.paidCents ?? 0;
    return {
      poolAccruedCents: accruedCents,
      poolPaidCents: paidCents,
      poolAvailableCents: accruedCents - paidCents,
    };
  };

  if (plan.awards.length === 0) {
    return {
      evaluatedCount: plan.evaluatedCount,
      paid: [],
      flagged: [],
      skus: [],
      paidCents: 0,
      ...(await poolState()),
    };
  }

  // Which of these already exist? Settlement runs on every registration
  // confirm, so the same member can be re-evaluated many times.
  const existing = await client.rankAward.findMany({
    where: { OR: plan.awards.map((a) => ({ userId: a.userId, kind: a.kind, rankId: a.rankId })) },
    select: { userId: true, kind: true, rankId: true },
  });
  const seen = new Set(existing.map((e) => `${e.userId}:${e.kind}:${e.rankId}`));
  const fresh = plan.awards.filter((a) => !seen.has(keyFor(a)));

  const pool = await client.bonusPool.upsert({
    where: { kind: "RANK" },
    create: { kind: "RANK", accruedCents: 0 },
    update: {},
    select: { id: true, accruedCents: true, paidCents: true },
  });

  const available = pool.accruedCents - pool.paidCents;
  const budget = applyPoolBudget(fresh, available);

  const paid: { userId: string; rankId: number; rewardCents: number }[] = [];
  const flagged: { userId: string; rankId: number; }[] = [];
  const skus: { userId: string; rankId: number; rewardSku: string }[] = [];
  let paidCents = 0;

  for (const award of budget.payable) {
    const rewardCents = award.rewardCents ?? 0;
    const description = `Associate rank ${award.rankId} milestone - registration ${paymentId}`;
    const idempotencyKey = `rank:${award.userId}:associate:${award.rankId}`;

    const created = await client.rankAward.create({
      data: {
        userId: award.userId,
        kind: "ASSOCIATE",
        rankId: award.rankId,
        rewardCents,
        status: "PAID",
        paidAt: new Date(),
      },
    });

    await client.commission.create({
      data: {
        userId: award.userId,
        type: "RANK_MILESTONE",
        amountCents: rewardCents,
        status: "PAID",
        pool: "RANK",
        refType: "RANK_AWARD",
        refId: created.id,
        description,
        idempotencyKey,
      },
    });

    await creditWallet(client, {
      userId: award.userId,
      amountCents: rewardCents,
      sourceUserId: null, // pool-funded: no single member caused it
      refType: "RANK_AWARD",
      refId: created.id,
      idempotencyKey,
      description,
    });

    const after = await client.bonusPool.update({
      where: { id: pool.id },
      data: { paidCents: { increment: rewardCents } },
      select: { accruedCents: true, paidCents: true },
    });

    await client.poolLedgerEntry.create({
      data: {
        poolId: pool.id,
        kind: "RANK",
        entryType: "PAYOUT",
        amountCents: rewardCents,
        // Pool balance means AVAILABLE (accrued − paid) for every entry type,
        // accrual rows included; they were written while paidCents was 0, so
        // both readings coincide there and the column keeps one meaning.
        balanceAfterCents: after.accruedCents - after.paidCents,
        refType: "RANK_AWARD",
        refId: created.id,
      },
    });

    paid.push({ userId: award.userId, rankId: award.rankId, rewardCents });
    paidCents += rewardCents;
  }

  for (const award of budget.flagged) {
    await client.rankAward.create({
      data: {
        userId: award.userId,
        kind: "ASSOCIATE",
        rankId: award.rankId,
        rewardCents: award.rewardCents,
        status: "FLAGGED",
      },
    });
    flagged.push({ userId: award.userId, rankId: award.rankId });
  }

  for (const award of budget.skus) {
    await client.rankAward.create({
      data: {
        userId: award.userId,
        kind: "LEADERSHIP",
        rankId: award.rankId,
        rewardSku: award.rewardSku,
        status: "PENDING",
      },
    });
    skus.push({
      userId: award.userId,
      rankId: award.rankId,
      rewardSku: award.rewardSku ?? "",
    });
  }

  // Promote only for awards written in THIS pass; skipped awards were already
  // promoted when they were first recorded.
  const freshUsers = new Set(fresh.map((a) => a.userId));
  for (const promotion of plan.promotions) {
    if (!freshUsers.has(promotion.userId)) continue;
    await client.user.update({
      where: { id: promotion.userId },
      data: {
        highestAssociateRank: promotion.highestAssociateRank,
        highestLeadershipRank: promotion.highestLeadershipRank,
      },
    });
  }

  return {
    evaluatedCount: plan.evaluatedCount,
    paid,
    flagged,
    skus,
    paidCents,
    ...(await poolState()),
  };
}
