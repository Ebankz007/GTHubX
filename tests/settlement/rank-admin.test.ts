import { describe, expect, it } from "vitest";
import type { RankAwardStatus } from "@/lib/generated/prisma/enums";
import {
  rankAwardTransition,
  isRankAwardAction,
  type RankAwardAction,
} from "@/lib/settlement/rank-admin";

/**
 * The whole 6d matrix: only FLAGGED Associate awards are actionable, and the
 * two actions are `MARK_PAID` (pool-pay, coverage permitting) and `REJECT`
 * (no money). Everything else is refused with a reason.
 */

const STATUSES: RankAwardStatus[] = ["PENDING", "FLAGGED", "PAID", "REJECTED"];
const ACTIONS: RankAwardAction[] = ["MARK_PAID", "REJECT"];

describe("rankAwardTransition — full matrix", () => {
  it("FLAGGED Associate + MARK_PAID -> PAID, pool-pay", () => {
    const t = rankAwardTransition("FLAGGED", "ASSOCIATE", "MARK_PAID");
    expect(t.allowed).toBe(true);
    if (t.allowed) {
      expect(t.next).toBe("PAID");
      expect(t.money).toBe("pool-pay");
    }
  });

  it("FLAGGED Associate + REJECT -> REJECTED, no money", () => {
    const t = rankAwardTransition("FLAGGED", "ASSOCIATE", "REJECT");
    expect(t.allowed).toBe(true);
    if (t.allowed) {
      expect(t.next).toBe("REJECTED");
      expect(t.money).toBe("none");
    }
  });

  for (const status of ["PENDING", "PAID", "REJECTED"] as RankAwardStatus[]) {
    for (const action of ACTIONS) {
      it(`${status} + ${action} -> refused with a reason`, () => {
        const t = rankAwardTransition(status, "ASSOCIATE", action);
        expect(t.allowed).toBe(false);
        if (!t.allowed) expect(t.reason.length).toBeGreaterThan(0);
      });
    }
  }

  for (const status of STATUSES) {
    for (const action of ACTIONS) {
      it(`LEADERSHIP ${status} + ${action} -> refused (SKU, not cash)`, () => {
        const t = rankAwardTransition(status, "LEADERSHIP", action);
        expect(t.allowed).toBe(false);
        if (!t.allowed) expect(t.reason).toContain("SKU");
      });
    }
  }

  it("PAID and REJECTED are terminal", () => {
    for (const action of ACTIONS) {
      expect(rankAwardTransition("PAID", "ASSOCIATE", action).allowed).toBe(false);
      expect(rankAwardTransition("REJECTED", "ASSOCIATE", action).allowed).toBe(false);
    }
  });

  it("exactly one money-moving action exists: MARK_PAID", () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        const t = rankAwardTransition(status, "ASSOCIATE", action);
        if (!t.allowed) continue;
        expect(t.money).toBe(action === "MARK_PAID" ? "pool-pay" : "none");
      }
    }
  });
});

describe("isRankAwardAction", () => {
  it("accepts the two real actions and nothing else", () => {
    expect(isRankAwardAction("MARK_PAID")).toBe(true);
    expect(isRankAwardAction("REJECT")).toBe(true);
    expect(isRankAwardAction("APPROVE")).toBe(false);
    expect(isRankAwardAction("mark-paid")).toBe(false);
    expect(isRankAwardAction(null)).toBe(false);
    expect(isRankAwardAction(42)).toBe(false);
  });
});
