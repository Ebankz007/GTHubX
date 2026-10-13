import { describe, it, expect } from "vitest";
import { cn, slugify, truncate, formatPrice } from "@/lib/utils";

describe("cn", () => {
  it("merges and dedupes tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(slugify("Global Traders HubX!")).toBe("global-traders-hubx");
    expect(slugify("  Copy   Trading  ")).toBe("copy-trading");
    expect(slugify("A_B-C")).toBe("a-b-c");
  });
});

describe("truncate", () => {
  it("returns input unchanged when short enough", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("adds an ellipsis when over length", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });
});

describe("formatPrice", () => {
  it("returns Free for null/zero", () => {
    expect(formatPrice(null)).toBe("Free");
    expect(formatPrice(0)).toBe("Free");
  });
  it("formats a currency amount", () => {
    expect(formatPrice(12500)).toBe("$12,500");
  });
});
