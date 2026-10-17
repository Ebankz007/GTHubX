import { describe, expect, it } from "vitest";
import {
  applyPoolBudget,
  planRankAwards,
  type PlannedRankAward,
} from "@/lib/settlement/rank-plan";
import { buildNetworkIndex, type MemberNode } from "@/lib/engine";

function member(
  id: string,
  sponsorId: string | null,
  highestAssociateRank = 0,
  highestLeadershipRank = 0,
): MemberNode {
  return {
    id,
    sponsorId,
    isActive: true,
    highestAssociateRank,
    highestLeadershipRank,
  };
}

/** M with 3 balanced legs of 3 members -> 3 refs, team volume 12. */
function rankOneMembers(): MemberNode[] {
  const nodes: MemberNode[] = [member("M", null)];
  for (const leg of ["A", "B", "C"]) {
    nodes.push(member(leg, "M"));
    for (let i = 1; i <= 3; i += 1) nodes.push(member(`${leg}${i}`, leg));
  }
  return nodes;
}

describe("planRankAwards — associate", () => {
  it("awards the upline that newly qualifies, with promotion, from a deep chain", () => {
    // new -> A1 -> M : only M qualifies (3 refs, 12 team)
    const nodes = rankOneMembers();
    nodes.push(member("new", "A1"));
    const index = buildNetworkIndex(nodes);

    const plan = planRankAwards({ index, newMemberId: "new" });

    expect(plan.evaluatedCount).toBe(4); // new, A1, A, M
    expect(plan.awards).toEqual([
      { userId: "M", kind: "ASSOCIATE", rankId: 1, rewardCents: 1400, rewardSku: null },
    ]);
    expect(plan.promotions).toEqual([
      { userId: "M", highestAssociateRank: 1, highestLeadershipRank: 0 },
    ]);
  });

  it("plans nothing when nobody in the chain qualifies", () => {
    const nodes: MemberNode[] = [member("M", null)];
    nodes.push(member("A", "M"));
    nodes.push(member("new", "A"));
    const plan = planRankAwards({
      index: buildNetworkIndex(nodes),
      newMemberId: "new",
    });
    expect(plan.awards).toEqual([]);
    expect(plan.promotions).toEqual([]);
    expect(plan.evaluatedCount).toBe(3);
  });

  it("does not re-award a rank the member already holds", () => {
    const nodes = [member("M", null, 1), ...rankOneMembers().slice(1).map((n) => n)];
    const withNew = [...nodes, member("new", "A1")];
    const plan = planRankAwards({
      index: buildNetworkIndex(withNew),
      newMemberId: "new",
    });
    expect(plan.awards).toEqual([]);
    expect(plan.promotions).toEqual([]);
  });

  it("awards only the HIGHEST newly-qualified rank, never back-pays skipped ones", () => {
    // 7 refs x 6 members = 42 team volume -> qualifies Rank 2 (7/40), not 1 or 3
    const nodes: MemberNode[] = [member("M", null)];
    for (let leg = 1; leg <= 7; leg += 1) {
      nodes.push(member(`L${leg}`, "M"));
      for (let i = 1; i <= 5; i += 1) nodes.push(member(`L${leg}k${i}`, `L${leg}`));
    }
    nodes.push(member("new", "L1"));
    const plan = planRankAwards({
      index: buildNetworkIndex(nodes),
      newMemberId: "new",
    });
    expect(plan.awards).toEqual([
      { userId: "M", kind: "ASSOCIATE", rankId: 2, rewardCents: 3200, rewardSku: null },
    ]);
  });

  it("respects the 40% leg rule even when raw team volume clears the bar", () => {
    // one leg of 10 + two bare refs: raw volume 12, capped eligible ~6.8
    const nodes: MemberNode[] = [member("M", null)];
    nodes.push(member("A", "M"));
    for (let i = 1; i <= 9; i += 1) nodes.push(member(`A${i}`, "A"));
    nodes.push(member("B", "M"));
    nodes.push(member("C", "M"));
    nodes.push(member("new", "B"));
    const plan = planRankAwards({
      index: buildNetworkIndex(nodes),
      newMemberId: "new",
    });
    expect(plan.awards).toEqual([]);
  });
});

describe("planRankAwards — leadership", () => {
  /** S1 at Associate 3, with B/C/b1 also at rank 3 across two legs. */
  function leadershipMembers(): MemberNode[] {
    return [
      member("S1", null, 3),
      member("A", "S1", 0),
      member("B", "S1", 3),
      member("C", "S1", 3),
      member("a1", "A"),
      member("b1", "B", 3),
      member("b2", "B"),
      member("c1", "C"),
      member("new", "a1"),
    ];
  }

  it("plans a SKU milestone (no cash) once the associate gate passes", () => {
    const plan = planRankAwards({
      index: buildNetworkIndex(leadershipMembers()),
      newMemberId: "new",
    });
    expect(plan.awards).toEqual([
      { userId: "S1", kind: "LEADERSHIP", rankId: 1, rewardCents: null, rewardSku: "SMARTPHONE" },
    ]);
    expect(plan.promotions).toEqual([
      { userId: "S1", highestAssociateRank: 3, highestLeadershipRank: 1 },
    ]);
  });

  it("blocks leadership when the member's own associate rank is short", () => {
    const nodes = leadershipMembers().map((n) =>
      n.id === "S1" ? member("S1", null, 0) : n,
    );
    const plan = planRankAwards({
      index: buildNetworkIndex(nodes),
      newMemberId: "new",
    });
    expect(plan.awards).toEqual([]);
  });

  it("sees an associate promotion made in the SAME pass when gating leadership", () => {
    // M starts at 0 but qualifies Associate 3 in this pass (15 refs, 135 team);
    // leadership rank 1 requires Associate 3 — so the gate only passes if the
    // just-decided associate award is visible to the leadership evaluation.
    const nodes: MemberNode[] = [member("M", null)];
    for (let leg = 1; leg <= 15; leg += 1) {
      const rank = leg <= 2 ? 3 : 0;
      nodes.push(member(`L${leg}`, "M", rank));
      for (let i = 1; i <= 8; i += 1) {
        nodes.push(
          member(`L${leg}k${i}`, `L${leg}`, leg === 3 && i === 1 ? 3 : 0),
        );
      }
    }
    nodes.push(member("new", "L1"));

    const plan = planRankAwards({
      index: buildNetworkIndex(nodes),
      newMemberId: "new",
    });

    expect(plan.awards).toEqual([
      { userId: "M", kind: "ASSOCIATE", rankId: 3, rewardCents: 10000, rewardSku: null },
      { userId: "M", kind: "LEADERSHIP", rankId: 1, rewardCents: null, rewardSku: "SMARTPHONE" },
    ]);
    expect(plan.promotions).toEqual([
      { userId: "M", highestAssociateRank: 3, highestLeadershipRank: 1 },
    ]);
  });
});

describe("applyPoolBudget", () => {
  const cash = (userId: string, rewardCents: number): PlannedRankAward => ({
    userId,
    kind: "ASSOCIATE",
    rankId: 1,
    rewardCents,
    rewardSku: null,
  });
  const sku = (userId: string): PlannedRankAward => ({
    userId,
    kind: "LEADERSHIP",
    rankId: 1,
    rewardCents: null,
    rewardSku: "SMARTPHONE",
  });

  it("pays nearest-first and flags what the pool cannot cover", () => {
    const budget = applyPoolBudget([cash("A", 1400), cash("S2", 1400)], 1800);
    expect(budget.payable.map((a) => a.userId)).toEqual(["A"]);
    expect(budget.flagged.map((a) => a.userId)).toEqual(["S2"]);
    expect(budget.spentCents).toBe(1400);
  });

  it("flags everything when the pool is empty", () => {
    const budget = applyPoolBudget([cash("A", 1400)], 0);
    expect(budget.payable).toEqual([]);
    expect(budget.flagged.map((a) => a.userId)).toEqual(["A"]);
    expect(budget.spentCents).toBe(0);
  });

  it("pays an award that exactly equals the available balance", () => {
    const budget = applyPoolBudget([cash("A", 1400)], 1400);
    expect(budget.payable.map((a) => a.userId)).toEqual(["A"]);
    expect(budget.flagged).toEqual([]);
  });

  it("never budget-limits a leadership SKU — it costs no money", () => {
    const budget = applyPoolBudget([cash("A", 1400), sku("S1")], 0);
    expect(budget.payable).toEqual([]);
    expect(budget.skus.map((a) => a.userId)).toEqual(["S1"]);
    expect(budget.flagged.map((a) => a.userId)).toEqual(["A"]);
    expect(budget.spentCents).toBe(0);
  });
});
