import { describe, expect, it } from "vitest";
import { buildNetworkIndex, type MemberNode } from "@/lib/engine";
import { planRegistrationSettlement } from "@/lib/settlement/plan";

/** A member as the engine sees them. Active by default. */
function n(id: string, sponsorId: string | null, isActive = true): MemberNode {
  return {
    id,
    sponsorId,
    isActive,
    highestAssociateRank: 0,
    highestLeadershipRank: 0,
  };
}

describe("planRegistrationSettlement", () => {
  it("pays the direct sponsor $15 and the upline generations their rates", () => {
    // A -> B -> C -> D(new). D's sponsor is C.
    const index = buildNetworkIndex([n("A", null), n("B", "A"), n("C", "B"), n("D", "C")]);
    const plan = planRegistrationSettlement({ index, newMemberId: "D" });

    expect(plan.direct).toEqual({ recipientId: "C", amountCents: 1500 });
    // chain is [D, C, B, A]: generation 2 is chain[2] = B at 4% = $2.00,
    // generation 3 is chain[3] = A at 2% = $1.00.
    expect(plan.generations).toEqual([
      { recipientId: "B", generation: 2, amountCents: 200 },
      { recipientId: "A", generation: 3, amountCents: 100 },
    ]);
  });

  it("credits every generation the tree is deep enough to reach", () => {
    // 7 upline levels so generations 2..6 all have a recipient.
    const nodes = [n("U6", null)];
    for (let i = 5; i >= 1; i--) nodes.push(n(`U${i}`, i === 6 ? "U6" : `U${i + 1}`));
    nodes.push(n("NEW", "U1"));

    const plan = planRegistrationSettlement({
      index: buildNetworkIndex(nodes),
      newMemberId: "NEW",
    });

    expect(plan.generations.map((g) => g.amountCents)).toEqual([
      200, 100, 75, 75, 50,
    ]);
    // 4% + 2% + 1.5% + 1.5% + 1% = 10% of the $50 fee = the full generation pool.
    expect(plan.generations.reduce((a, g) => a + g.amountCents, 0)).toBe(500);
  });

  it("compresses an inactive sponsor's direct bonus to the next active upline", () => {
    const index = buildNetworkIndex([
      n("A", null),
      n("B", "A"),
      n("C", "B", false), // sponsor is not an Active Member
      n("D", "C"),
    ]);
    const plan = planRegistrationSettlement({ index, newMemberId: "D" });

    expect(plan.direct).toEqual({ recipientId: "B", amountCents: 1500 });
  });

  it("pays nothing to the upline when the new member has no sponsor", () => {
    const index = buildNetworkIndex([n("A", null), n("B", null)]);
    const plan = planRegistrationSettlement({ index, newMemberId: "B" });

    expect(plan.direct).toBeNull();
    expect(plan.generations).toEqual([]);
  });

  it("keeps the rank and leadership pool contributions intact regardless of tree depth", () => {
    const index = buildNetworkIndex([n("A", null), n("B", "A")]);
    const plan = planRegistrationSettlement({ index, newMemberId: "B" });

    expect(plan.rankPoolCents).toBe(400);
    expect(plan.leadershipPoolCents).toBe(350);
    expect(plan.allocation.companyReserveCents).toBe(2250);
  });

  it("reconciles every cent of the community pool when the tree is deep enough", () => {
    const nodes = [n("U6", null)];
    for (let i = 5; i >= 1; i--) nodes.push(n(`U${i}`, i === 6 ? "U6" : `U${i + 1}`));
    nodes.push(n("NEW", "U1"));

    const plan = planRegistrationSettlement({
      index: buildNetworkIndex(nodes),
      newMemberId: "NEW",
    });

    const distributed =
      (plan.direct?.amountCents ?? 0) +
      plan.generations.reduce((a, g) => a + g.amountCents, 0) +
      plan.rankPoolCents +
      plan.leadershipPoolCents;

    // $15 direct + $5 generation + $4 rank + $3.50 leadership = $27.50 = 55%.
    expect(distributed).toBe(2750);
  });

  it("scales with a non-default fee", () => {
    const index = buildNetworkIndex([n("A", null), n("B", "A")]);
    const plan = planRegistrationSettlement({
      index,
      newMemberId: "B",
      feeCents: 10_000,
    });

    expect(plan.direct?.amountCents).toBe(3000); // 30% of $100
    expect(plan.rankPoolCents).toBe(800); // 8%
    expect(plan.leadershipPoolCents).toBe(700); // 7%
    expect(plan.allocation.companyReserveCents).toBe(4500); // 45%
  });

  it("rejects a non-positive fee instead of allocating nonsense", () => {
    const index = buildNetworkIndex([n("A", null)]);
    expect(() =>
      planRegistrationSettlement({ index, newMemberId: "A", feeCents: 0 }),
    ).toThrow();
  });
});
