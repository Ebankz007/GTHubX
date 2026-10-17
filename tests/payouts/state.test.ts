import { describe, expect, it } from "vitest";
import type { PayoutStatus } from "@/lib/generated/prisma/enums";
import {
  payoutTransition,
  isPayoutAction,
  type PayoutAction,
} from "@/lib/payouts/state";

/**
 * The full transition matrix, every status × every action — because this is
 * the file that decides whether money moves. Anything the DB claim refuses
 * (race lost) or accepts is checked against these same rules in the writers.
 */

const STATUSES: PayoutStatus[] = ["REQUESTED", "APPROVED", "REJECTED", "PAID"];
const ACTIONS: PayoutAction[] = ["APPROVE", "REJECT", "MARK_PAID"];

/** The matrix as the business defines it: allowed -> next status + money. */
const EXPECTED: Record<
  PayoutStatus,
  Record<PayoutAction, { allowed: boolean; next?: PayoutStatus; money?: "none" | "refund" }>
> = {
  REQUESTED: {
    APPROVE: { allowed: true, next: "APPROVED", money: "none" },
    REJECT: { allowed: true, next: "REJECTED", money: "refund" },
    MARK_PAID: { allowed: false },
  },
  APPROVED: {
    APPROVE: { allowed: false },
    REJECT: { allowed: true, next: "REJECTED", money: "refund" },
    MARK_PAID: { allowed: true, next: "PAID", money: "none" },
  },
  REJECTED: {
    APPROVE: { allowed: false },
    REJECT: { allowed: false },
    MARK_PAID: { allowed: false },
  },
  PAID: {
    APPROVE: { allowed: false },
    REJECT: { allowed: false },
    MARK_PAID: { allowed: false },
  },
};

describe("payoutTransition — full matrix", () => {
  for (const status of STATUSES) {
    for (const action of ACTIONS) {
      const want = EXPECTED[status][action];
      it(`${status} --${action}--> ${want.allowed ? want.next : "refused"} (${
        want.allowed ? want.money : "no money"
      })`, () => {
        const got = payoutTransition(status, action);
        if (!want.allowed) {
          expect(got.allowed).toBe(false);
          if (!got.allowed) {
            // A refusal must always carry a reason a human can act on.
            expect(got.reason.length).toBeGreaterThan(0);
          }
          return;
        }
        expect(got.allowed).toBe(true);
        if (got.allowed) {
          expect(got.next).toBe(want.next);
          expect(got.money).toBe(want.money);
        }
      });
    }
  }
});

describe("payoutTransition — load-bearing details", () => {
  it("PAID is terminal: no action, no money, no exceptions", () => {
    for (const action of ACTIONS) {
      expect(payoutTransition("PAID", action).allowed).toBe(false);
    }
  });

  it("REJECTED is terminal for the payout, but the refund already happened", () => {
    for (const action of ACTIONS) {
      expect(payoutTransition("REJECTED", action).allowed).toBe(false);
    }
  });

  it("MARK_PAID can never skip review — REQUESTED -> PAID is refused", () => {
    const t = payoutTransition("REQUESTED", "MARK_PAID");
    expect(t.allowed).toBe(false);
  });

  it("rejecting an APPROVED payout is legal (change of mind before delivery)", () => {
    const t = payoutTransition("APPROVED", "REJECT");
    expect(t.allowed).toBe(true);
    if (t.allowed) {
      expect(t.money).toBe("refund");
    }
  });

  it("every allowed REJECT carries a refund; no other action moves money", () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        const t = payoutTransition(status, action);
        if (!t.allowed) continue;
        expect(t.money).toBe(action === "REJECT" ? "refund" : "none");
      }
    }
  });
});

describe("isPayoutAction", () => {
  it("accepts the three real actions", () => {
    expect(isPayoutAction("APPROVE")).toBe(true);
    expect(isPayoutAction("REJECT")).toBe(true);
    expect(isPayoutAction("MARK_PAID")).toBe(true);
  });

  it("refuses anything else, including near-misses and non-strings", () => {
    expect(isPayoutAction("approve")).toBe(false);
    expect(isPayoutAction("PAID")).toBe(false);
    expect(isPayoutAction("")).toBe(false);
    expect(isPayoutAction(undefined)).toBe(false);
    expect(isPayoutAction(42)).toBe(false);
    expect(isPayoutAction({ action: "APPROVE" })).toBe(false);
  });
});
