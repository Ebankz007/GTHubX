import { describe, expect, it } from "vitest";
import {
  assertIntegerCents,
  formatCents,
  formatCentsCompact,
  parseAmountToCents,
  sumCents,
} from "@/lib/money";

describe("assertIntegerCents", () => {
  it("passes integers through", () => {
    expect(assertIntegerCents(2000)).toBe(2000);
    expect(assertIntegerCents(0)).toBe(0);
  });
  it("rejects fractional cents", () => {
    expect(() => assertIntegerCents(20.5)).toThrow();
  });
});

describe("parseAmountToCents", () => {
  it("parses whole and decimal amounts", () => {
    expect(parseAmountToCents("20")).toBe(2000);
    expect(parseAmountToCents("20.00")).toBe(2000);
    expect(parseAmountToCents("20.5")).toBe(2050);
    expect(parseAmountToCents("0.01")).toBe(1);
  });
  it("tolerates thousands separators", () => {
    expect(parseAmountToCents("1,250.50")).toBe(125050);
  });
  it("accepts a negative amount", () => {
    expect(parseAmountToCents("-3.00")).toBe(-300);
  });
  it("rejects sub-cent precision and junk", () => {
    expect(() => parseAmountToCents("20.001")).toThrow();
    expect(() => parseAmountToCents("abc")).toThrow();
    expect(() => parseAmountToCents("")).toThrow();
  });
});

describe("formatCents", () => {
  it("formats with two decimals", () => {
    expect(formatCents(2000)).toBe("$20.00");
    expect(formatCents(125050)).toBe("$1,250.50");
    expect(formatCents(1)).toBe("$0.01");
  });
  it("formats negatives with a leading sign", () => {
    expect(formatCents(-300)).toBe("-$3.00");
  });
});

describe("formatCentsCompact", () => {
  it("drops .00 for whole dollars", () => {
    expect(formatCentsCompact(2000)).toBe("$20");
    expect(formatCentsCompact(125050)).toBe("$1,250.50");
  });
});

describe("sumCents", () => {
  it("sums integer cents", () => {
    expect(sumCents([600, 900, 200, 160, 140])).toBe(2000);
  });
  it("rejects a fractional member", () => {
    expect(() => sumCents([100, 0.5])).toThrow();
  });
});
