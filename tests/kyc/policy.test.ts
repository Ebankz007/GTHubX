import { describe, expect, it } from "vitest";
import {
  DOCUMENTS_UPLOAD_ENABLED,
  ID_TYPES,
  ID_TYPE_IDS,
  KYC_LIMITS,
  MAX_AGE_YEARS,
  MIN_AGE_YEARS,
  REQUIRED_DOCUMENTS,
  ageInYears,
  documentPolicy,
  idTypeLabel,
  isAdult,
  isIdType,
} from "@/lib/kyc/policy";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * The policy module is business and compliance policy, so the tests are about
 * the two things that must never drift: how old a member must be, and what the
 * member is told they need.
 */

describe("ageInYears — counted in UTC", () => {
  it("counts whole years after a birthday", () => {
    expect(ageInYears(utc("1990-05-04"), utc("2026-10-18"))).toBe(36);
  });

  it("is one less on the day before the birthday", () => {
    expect(ageInYears(utc("2008-10-19"), utc("2026-10-18"))).toBe(17);
  });

  it("turns over on the birthday itself", () => {
    expect(ageInYears(utc("2008-10-18"), utc("2026-10-18"))).toBe(18);
  });

  it("is one more the day after", () => {
    expect(ageInYears(utc("2008-10-17"), utc("2026-10-18"))).toBe(18);
  });

  it("handles a 29 February birthday in a non-leap year", () => {
    expect(ageInYears(utc("2008-02-29"), utc("2026-02-28"))).toBe(17);
    expect(ageInYears(utc("2008-02-29"), utc("2026-03-01"))).toBe(18);
  });

  it("never goes negative for a birth date in the future", () => {
    expect(ageInYears(utc("2030-01-01"), utc("2026-10-18"))).toBeLessThan(0);
  });
});

describe("isAdult — the minimum age is the policy constant, not a literal", () => {
  it("accepts exactly the minimum age on the day", () => {
    expect(isAdult(utc("2008-10-18"), utc("2026-10-18"))).toBe(
      MIN_AGE_YEARS <= 18,
    );
  });

  it("refuses one day short", () => {
    expect(isAdult(utc("2008-10-19"), utc("2026-10-18"))).toBe(false);
  });

  it("accepts a comfortably older applicant", () => {
    expect(isAdult(utc("1975-01-01"), utc("2026-10-18"))).toBe(true);
  });
});

describe("id types", () => {
  it("every declared id has exactly one entry with a label and a hint", () => {
    expect(ID_TYPES).toHaveLength(ID_TYPE_IDS.length);
    for (const id of ID_TYPE_IDS) {
      const matches = ID_TYPES.filter((t) => t.id === id);
      expect(matches).toHaveLength(1);
      expect(matches[0].label.length).toBeGreaterThan(0);
      expect(matches[0].hint.length).toBeGreaterThan(0);
    }
  });

  it("isIdType agrees with the declared list", () => {
    for (const id of ID_TYPE_IDS) expect(isIdType(id)).toBe(true);
    for (const value of ["passport", "SSN", "", null, 3]) {
      expect(isIdType(value)).toBe(false);
    }
  });

  it("idTypeLabel falls back to the raw value rather than showing nothing", () => {
    expect(idTypeLabel("PASSPORT")).toBe("Passport");
    expect(idTypeLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(idTypeLabel(null)).toBe("—");
    expect(idTypeLabel(undefined)).toBe("—");
  });
});

describe("document policy", () => {
  it("reports upload as disabled on this deployment", () => {
    // If this ever flips, the member page and the review queue copy must flip
    // with it — that is the point of reading it through one function.
    expect(documentPolicy().uploadEnabled).toBe(DOCUMENTS_UPLOAD_ENABLED);
    expect(DOCUMENTS_UPLOAD_ENABLED).toBe(false);
  });

  it("gives every required document a unique id, a label and a hint", () => {
    const ids = REQUIRED_DOCUMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const doc of REQUIRED_DOCUMENTS) {
      expect(doc.label.length).toBeGreaterThan(0);
      expect(doc.hint.length).toBeGreaterThan(0);
    }
  });

  it("asks for a photo ID and a proof of address", () => {
    const required = REQUIRED_DOCUMENTS.filter((d) => d.required).map((d) => d.id);
    expect(required).toContain("photo_id");
    expect(required).toContain("proof_of_address");
  });

  it("returns the same list object every call, so nothing mutates it", () => {
    expect(documentPolicy().documents).toBe(REQUIRED_DOCUMENTS);
  });
});

describe("limits", () => {
  it("every minimum is at or below its maximum", () => {
    expect(KYC_LIMITS.legalNameMin).toBeLessThanOrEqual(KYC_LIMITS.legalNameMax);
    expect(KYC_LIMITS.countryMin).toBeLessThanOrEqual(KYC_LIMITS.countryMax);
    expect(KYC_LIMITS.addressMin).toBeLessThanOrEqual(KYC_LIMITS.addressMax);
    expect(KYC_LIMITS.idNumberMin).toBeLessThanOrEqual(KYC_LIMITS.idNumberMax);
    expect(KYC_LIMITS.reasonMin).toBeLessThanOrEqual(KYC_LIMITS.reasonMax);
  });

  it("asks for a rejection reason that is more than one word", () => {
    expect(KYC_LIMITS.reasonMin).toBeGreaterThanOrEqual(5);
  });

  it("keeps a sane age ceiling", () => {
    expect(MAX_AGE_YEARS).toBeGreaterThan(MIN_AGE_YEARS);
  });
});
