import { randomBytes, createHash } from "node:crypto";

/** Raw entropy per token, in bytes. 32 bytes → 43 URL-safe chars. */
const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically-random, URL-safe token.
 * The raw value is returned to the caller ONCE (to set in a cookie or email a
 * link) and is never persisted — only its hash is.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256 hash of a token — the form we store.
 *
 * A fast hash is correct here: the token is 256 bits of uniform randomness, so
 * there is no dictionary to attack. (Passwords are the opposite case and use
 * bcrypt — see lib/password.ts.)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time-ish comparison for equal-length hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
