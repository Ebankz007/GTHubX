import { describe, expect, it } from "vitest";
import { bpsOf, centsToUsd, splitByBps, usdToCents } from "@/lib/engine";

describe("bpsOf", () => {
  it("applies a basis-point weight and floors", () => {
    expect(bpsOf(2000, 3000)).toBe(600); // 30% of $20
    expect(bpsOf(2000, 800)).toBe(160); // 8% of $20
    expect(bpsOf(100, 333)).toBe(3); // floors 3.33
  });
});

describe("splitByBps (largest-remainder rounding)", () => {
  it("splits exactly with no lost cents", () => {
    expect(splitByBps(2000, [4500, 3000, 1000, 800, 700])).toEqual([900, 600, 200, 160, 140]);
  });

  it("always sums exactly to the source, for arbitrary inputs", () => {
    for (const total of [1, 3, 7, 99, 101, 2001, 3333, 99999]) {
      const parts = splitByBps(total, [4500, 3000, 1000, 800, 700]);
      expect(parts.reduce((s, v) => s + v, 0)).toBe(total);
    }
  });

  it("rejects a non-integer total", () => {
    expect(() => splitByBps(10.5, [5000, 5000])).toThrow();
  });

  it("rejects non-positive weights", () => {
    expect(() => splitByBps(100, [0, 0])).toThrow();
  });
});

describe("cents <-> usd", () => {
  it("converts cents to a display number", () => {
    expect(centsToUsd(2000)).toBe(20);
    expect(centsToUsd(1234)).toBe(12.34);
  });

  it("converts whole-cent usd back to cents", () => {
    expect(usdToCents(20)).toBe(2000);
    expect(usdToCents(0.01)).toBe(1);
  });

  it("rejects sub-cent precision", () => {
    expect(() => usdToCents(0.001)).toThrow();
    expect(() => usdToCents(1.005)).toThrow();
  });
});
