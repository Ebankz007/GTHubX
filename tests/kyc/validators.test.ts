import { describe, expect, it } from "vitest";
import {
  kycDecisionSchema,
  kycSubmissionSchema,
  firstError,
} from "@/lib/validators";
import { ID_TYPE_IDS, KYC_LIMITS, MAX_AGE_YEARS } from "@/lib/kyc/policy";

/**
 * The edge. Two things here are load-bearing:
 *
 *  - a date of birth is judged in UTC and must be a real calendar date, so
 *    `2024-02-31` cannot quietly become 2 March;
 *  - a REJECT without an actionable reason never reaches the database, so the
 *    member is never sent a rejection email that says nothing.
 */

const valid = {
  legalName: "Ada Nwosu",
  dateOfBirth: "1990-05-04",
  country: "Nigeria",
  address: "12 Marina Road, Lagos Island, Lagos 101001",
  idType: "PASSPORT",
  idNumber: "A01234567",
};

describe("kycSubmissionSchema — accepted input", () => {
  it("parses a complete submission and yields a UTC date", () => {
    const parsed = kycSubmissionSchema.parse(valid);
    expect(parsed.legalName).toBe("Ada Nwosu");
    expect(parsed.dateOfBirth).toBeInstanceOf(Date);
    expect(parsed.dateOfBirth.toISOString()).toBe("1990-05-04T00:00:00.000Z");
    expect(parsed.idType).toBe("PASSPORT");
  });

  it("trims surrounding whitespace", () => {
    const parsed = kycSubmissionSchema.parse({
      ...valid,
      legalName: "  Ada Nwosu  ",
      country: " Nigeria ",
      idNumber: " A01234567 ",
    });
    expect(parsed.legalName).toBe("Ada Nwosu");
    expect(parsed.country).toBe("Nigeria");
    expect(parsed.idNumber).toBe("A01234567");
  });

  it("accepts every declared document type", () => {
    for (const idType of ID_TYPE_IDS) {
      expect(kycSubmissionSchema.safeParse({ ...valid, idType }).success).toBe(true);
    }
  });
});

describe("kycSubmissionSchema — refused input", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["a missing legal name", { ...valid, legalName: "" }],
    ["a one-character legal name", { ...valid, legalName: "A" }],
    ["a legal name past the limit", { ...valid, legalName: "A".repeat(KYC_LIMITS.legalNameMax + 1) }],
    ["a missing country", { ...valid, country: "" }],
    ["an address that is a single word", { ...valid, address: "Lagos" }],
    ["a missing document number", { ...valid, idNumber: "" }],
    ["a document number past the limit", { ...valid, idNumber: "9".repeat(KYC_LIMITS.idNumberMax + 1) }],
    ["an unknown document type", { ...valid, idType: "BUS_PASS" }],
    ["a lowercase document type", { ...valid, idType: "passport" }],
    ["a date of birth in the wrong format", { ...valid, dateOfBirth: "04/05/1990" }],
    ["a date of birth that is not a real day", { ...valid, dateOfBirth: "2024-02-31" }],
    ["a date of birth in the future", { ...valid, dateOfBirth: "2030-01-01" }],
    ["an applicant one day short of the minimum age", { ...valid, dateOfBirth: "2008-10-19" }],
    ["an impossible age", { ...valid, dateOfBirth: `${new Date().getUTCFullYear() - MAX_AGE_YEARS - 5}-01-01` }],
    ["a missing date of birth", { ...valid, dateOfBirth: undefined }],
  ];

  for (const [label, input] of cases) {
    it(`refuses ${label}`, () => {
      expect(kycSubmissionSchema.safeParse(input).success).toBe(false);
    });
  }

  it("refuses a submission that smuggles in a documents field it should not own", () => {
    // The schema strips unknown keys rather than storing them: nothing uploads
    // files, so a caller cannot put a fake document reference in the profile.
    const parsed = kycSubmissionSchema.parse({
      ...valid,
      documents: { photo_id: "https://example.test/passport.jpg" },
    });
    expect(parsed).not.toHaveProperty("documents");
  });

  it("gives a readable message for a bad date", () => {
    const result = kycSubmissionSchema.safeParse({ ...valid, dateOfBirth: "2024-02-31" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstError(result.error)).toContain("real calendar date");
    }
  });
});

describe("kycDecisionSchema", () => {
  it("accepts VERIFY with no reason", () => {
    expect(kycDecisionSchema.safeParse({ action: "VERIFY" }).success).toBe(true);
  });

  it("accepts VERIFY even with a stray reason", () => {
    expect(
      kycDecisionSchema.safeParse({ action: "VERIFY", reason: "looks fine" }).success,
    ).toBe(true);
  });

  it("accepts REJECT with an actionable reason", () => {
    expect(
      kycDecisionSchema.safeParse({ action: "REJECT", reason: "Blurred document" })
        .success,
    ).toBe(true);
  });

  it("refuses REJECT with no reason", () => {
    expect(kycDecisionSchema.safeParse({ action: "REJECT" }).success).toBe(false);
  });

  it("refuses REJECT with a reason below the floor", () => {
    expect(
      kycDecisionSchema.safeParse({ action: "REJECT", reason: "no" }).success,
    ).toBe(false);
  });

  it("refuses REJECT with a whitespace-only reason", () => {
    expect(
      kycDecisionSchema.safeParse({ action: "REJECT", reason: "        " }).success,
    ).toBe(false);
  });

  it("refuses a reason past the limit", () => {
    expect(
      kycDecisionSchema.safeParse({
        action: "REJECT",
        reason: "x".repeat(KYC_LIMITS.reasonMax + 1),
      }).success,
    ).toBe(false);
  });

  it("refuses an unknown action", () => {
    for (const action of ["APPROVE", "verify", "reject", "", null]) {
      expect(kycDecisionSchema.safeParse({ action }).success).toBe(false);
    }
  });

  it("names the reason field when it is the problem", () => {
    const result = kycDecisionSchema.safeParse({ action: "REJECT", reason: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("reason");
    }
  });
});
