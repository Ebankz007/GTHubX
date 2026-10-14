import { describe, expect, it } from "vitest";
import { generateToken, hashToken, safeEqual } from "@/lib/tokens";

describe("generateToken", () => {
  it("returns a 43-char URL-safe string (32 bytes base64url)", () => {
    const token = generateToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is unique across calls", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashToken", () => {
  it("is deterministic and 64-char lowercase hex", () => {
    const token = "a-fixed-token";
    const digest = hashToken(token);
    expect(digest).toBe(hashToken(token));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the token changes", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("safeEqual", () => {
  it("is true for identical strings", () => {
    expect(safeEqual("deadbeef", "deadbeef")).toBe(true);
  });

  it("is false for differing strings or lengths", () => {
    expect(safeEqual("deadbeef", "deadbeee")).toBe(false);
    expect(safeEqual("deadbeef", "deadbeef00")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});
