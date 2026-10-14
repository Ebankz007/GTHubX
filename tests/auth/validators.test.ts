import { describe, expect, it } from "vitest";
import {
  emailSchema,
  passwordSchema,
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  firstError,
} from "@/lib/validators";
import { MAX_PASSWORD_BYTES } from "@/lib/password";

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Jane@Example.COM ")).toBe("jane@example.com");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["nope", "a@b", "a b@c.com", "@example.com", ""]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("passwordSchema", () => {
  it("accepts a compliant password", () => {
    expect(passwordSchema.safeParse("Correct-Horse-9").success).toBe(true);
  });

  it("rejects short, and each missing character class", () => {
    expect(passwordSchema.safeParse("Ab1").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false);
    expect(passwordSchema.safeParse("ALLUPPERCASE1").success).toBe(false);
    expect(passwordSchema.safeParse("NoNumbersHere").success).toBe(false);
  });

  it("rejects anything longer than the bcrypt byte limit", () => {
    const tooLong = "Aa1" + "x".repeat(MAX_PASSWORD_BYTES);
    expect(passwordSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    fullName: "Jane Trader",
    email: "Jane@Example.com",
    password: "Correct-Horse-9",
  };

  it("accepts a minimal registration and normalises the email", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.email).toBe("jane@example.com");
    expect(parsed.fullName).toBe("Jane Trader");
  });

  it("requires a real name", () => {
    expect(registerSchema.safeParse({ ...valid, fullName: "J" }).success).toBe(
      false,
    );
  });

  it("treats optional fields as optional", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.phone).toBeUndefined();
    expect(parsed.referralCode).toBeUndefined();
  });
});

describe("loginSchema", () => {
  it("requires a non-empty password but does not enforce policy", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x" }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires a token and a compliant password", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "t", password: "Correct-Horse-9" })
        .success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ token: "", password: "Correct-Horse-9" })
        .success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "t", password: "weak" }).success,
    ).toBe(false);
  });
});

describe("firstError", () => {
  it("returns the first issue message", () => {
    const result = loginSchema.safeParse({ email: "bad", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof firstError(result.error)).toBe("string");
      expect(firstError(result.error).length).toBeGreaterThan(0);
    }
  });
});
