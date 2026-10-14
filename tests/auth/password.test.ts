import { describe, expect, it } from "vitest";
import {
  BCRYPT_COST,
  MAX_PASSWORD_BYTES,
  hashPassword,
  verifyPassword,
} from "@/lib/password";

describe("hashPassword", () => {
  it("produces a bcrypt hash at the configured cost", async () => {
    const digest = await hashPassword("Correct-Horse-9");
    expect(digest).toMatch(/^\$2[aby]\$/);
    expect(digest.startsWith(`$2b$${BCRYPT_COST}$`)).toBe(true);
  });

  it("salts — the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("Same-Password-1"),
      hashPassword("Same-Password-1"),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    const digest = await hashPassword("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", digest)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const digest = await hashPassword("Correct-Horse-9");
    expect(await verifyPassword("correct-horse-9", digest)).toBe(false);
  });

  it("returns false (never throws) on a missing or malformed hash", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("caps at 72 bytes — matching the validator's limit", () => {
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });
});
