import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hashIdNumber,
  idNumberLast4,
  idNumberReference,
  normalizeIdNumber,
} from "@/lib/kyc/identity";

/**
 * The document number is the most sensitive field the platform touches, and
 * since Phase 7d it is the field it does *not* store. These tests are about the
 * three properties that make that safe:
 *
 *  - the derived values are computed from one normalised form, so the same
 *    document always produces the same digest and the same last-four;
 *  - the digest is unusable without the key, and is not written at all when the
 *    key is absent (no unkeyed fallback — that would be obfuscation, not
 *    minimisation);
 *  - what a reviewer is shown never contains the number.
 */

const ORIGINAL_PEPPER = process.env.KYC_ID_PEPPER;

beforeEach(() => {
  delete process.env.KYC_ID_PEPPER;
});

afterEach(() => {
  if (ORIGINAL_PEPPER === undefined) {
    delete process.env.KYC_ID_PEPPER;
  } else {
    process.env.KYC_ID_PEPPER = ORIGINAL_PEPPER;
  }
});

describe("normalizeIdNumber", () => {
  it("trims, drops internal whitespace and upper-cases", () => {
    expect(normalizeIdNumber("  a0 12 34567 ")).toBe("A01234567");
  });

  it("leaves an already-normalised value alone", () => {
    expect(normalizeIdNumber("A01234567")).toBe("A01234567");
  });

  it("keeps hyphens and slashes, which are part of some formats", () => {
    expect(normalizeIdNumber("ab-123/45")).toBe("AB-123/45");
  });

  it("collapses a tab the same way it collapses a space", () => {
    expect(normalizeIdNumber("A0\t1234567")).toBe("A01234567");
  });
});

describe("idNumberLast4", () => {
  it("returns the last four characters", () => {
    expect(idNumberLast4("A01234567")).toBe("4567");
  });

  it("normalises before slicing, so the reference is comparable", () => {
    expect(idNumberLast4(" a0123 4567 ")).toBe("4567");
  });

  it("returns exactly four when the value is exactly four", () => {
    expect(idNumberLast4("1234")).toBe("1234");
  });

  it("returns null when there are fewer than four characters to keep", () => {
    expect(idNumberLast4("123")).toBeNull();
    expect(idNumberLast4("")).toBeNull();
  });
});

describe("hashIdNumber — keyed, and absent without a key", () => {
  it("returns null when no pepper is configured", () => {
    expect(hashIdNumber("A01234567")).toBeNull();
  });

  it("returns null when the pepper is blank rather than absent", () => {
    process.env.KYC_ID_PEPPER = "   ";
    expect(hashIdNumber("A01234567")).toBeNull();
  });

  it("returns a hex digest when a pepper is configured", () => {
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    const digest = hashIdNumber("A01234567");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same document and the same key", () => {
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    expect(hashIdNumber("A01234567")).toBe(hashIdNumber("A01234567"));
  });

  it("is stable across differently formatted input for the same document", () => {
    // The whole point of normalising first: a member who types the number with
    // a space on one attempt is the same person, and duplicate detection that
    // disagrees is a false negative.
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    expect(hashIdNumber("a0 1234567")).toBe(hashIdNumber("A01234567"));
  });

  it("changes when the key changes", () => {
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    const first = hashIdNumber("A01234567");
    process.env.KYC_ID_PEPPER = "test-pepper-two";
    expect(hashIdNumber("A01234567")).not.toBe(first);
  });

  it("differs for different documents under the same key", () => {
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    expect(hashIdNumber("A01234567")).not.toBe(hashIdNumber("A01234568"));
  });

  it("returns null for an empty document number even with a key set", () => {
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    expect(hashIdNumber("   ")).toBeNull();
  });

  it("does not contain the document number in the digest", () => {
    process.env.KYC_ID_PEPPER = "test-pepper-one";
    const digest = hashIdNumber("A01234567") ?? "";
    expect(digest).not.toContain("A01234567");
  });
});

describe("idNumberReference — what a reviewer is shown", () => {
  it("refers to the number by its last four characters", () => {
    expect(idNumberReference("4567")).toBe("ends 4567");
  });

  it("says so plainly when there is nothing on file", () => {
    expect(idNumberReference(null)).toBe("not recorded");
    expect(idNumberReference(undefined)).toBe("not recorded");
    expect(idNumberReference("")).toBe("not recorded");
  });

  it("is ASCII, so it survives a PowerShell console unmangled", () => {
    // The smoke harness reads this string through Get-Content on PS 5.1, which
    // is exactly where a bullet-based mask would arrive as mojibake.
    // eslint-disable-next-line no-control-regex
    expect(idNumberReference("4567")).toMatch(/^[\x20-\x7E]*$/);
  });
});
