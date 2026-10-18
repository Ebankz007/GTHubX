import { describe, expect, it } from "vitest";
import type { KycStatus } from "@/lib/generated/prisma/enums";
import {
  KYC_ACTIONS,
  KycError,
  canSubmit,
  isKycAction,
  kycTransition,
  type KycAction,
} from "@/lib/kyc/state";

/**
 * The whole KYC matrix: two transitions leave PENDING, nothing else moves, and
 * a rejection is never a dead end.
 */

const STATUSES: KycStatus[] = ["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED"];
const ACTIONS: KycAction[] = ["VERIFY", "REJECT"];

describe("kycTransition — full matrix", () => {
  it("PENDING + VERIFY -> VERIFIED", () => {
    const t = kycTransition("PENDING", "VERIFY");
    expect(t.allowed).toBe(true);
    if (t.allowed) expect(t.next).toBe("VERIFIED");
  });

  it("PENDING + REJECT -> REJECTED", () => {
    const t = kycTransition("PENDING", "REJECT");
    expect(t.allowed).toBe(true);
    if (t.allowed) expect(t.next).toBe("REJECTED");
  });

  for (const status of ["NOT_STARTED", "VERIFIED", "REJECTED"] as KycStatus[]) {
    for (const action of ACTIONS) {
      it(`${status} + ${action} -> refused with a reason`, () => {
        const t = kycTransition(status, action);
        expect(t.allowed).toBe(false);
        if (!t.allowed) expect(t.reason.length).toBeGreaterThan(0);
      });
    }
  }

  it("only PENDING can be decided", () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        expect(kycTransition(status, action).allowed).toBe(status === "PENDING");
      }
    }
  });

  it("no decision ever produces NOT_STARTED", () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        const t = kycTransition(status, action);
        if (t.allowed) expect(t.next).not.toBe("NOT_STARTED");
      }
    }
  });
});

describe("canSubmit — resubmission is a first-class path", () => {
  it("a fresh member may submit", () => {
    expect(canSubmit("NOT_STARTED").allowed).toBe(true);
  });

  it("a rejected member may submit again", () => {
    expect(canSubmit("REJECTED").allowed).toBe(true);
  });

  it("a member already in review may not overwrite the submission", () => {
    const gate = canSubmit("PENDING");
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("review");
  });

  it("a verified member may not re-enter the queue", () => {
    const gate = canSubmit("VERIFIED");
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("verified");
  });
});

describe("isKycAction", () => {
  it("accepts exactly the two actions", () => {
    for (const action of KYC_ACTIONS) expect(isKycAction(action)).toBe(true);
  });

  it("refuses anything else, including case variants", () => {
    for (const value of ["verify", "reject", "APPROVE", "", null, 7, undefined]) {
      expect(isKycAction(value)).toBe(false);
    }
  });
});

describe("KycError — codes map to HTTP statuses", () => {
  it("not_found is 404", () => {
    expect(new KycError("not_found", "x").status).toBe(404);
  });

  it("invalid_transition is 409", () => {
    expect(new KycError("invalid_transition", "x").status).toBe(409);
  });

  it("reason_required is 400", () => {
    expect(new KycError("reason_required", "x").status).toBe(400);
  });

  it("carries the code and a name for the route's catch block", () => {
    const error = new KycError("invalid_transition", "Already in review.");
    expect(error.code).toBe("invalid_transition");
    expect(error.name).toBe("KycError");
    expect(error.message).toBe("Already in review.");
  });
});
