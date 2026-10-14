import { hash, compare } from "bcryptjs";

/**
 * bcrypt cost factor. 12 is the ARCHITECTURE.md baseline — roughly 250–400 ms
 * per hash on commodity hardware, which is the point: it is slow on purpose.
 */
export const BCRYPT_COST = 12;

/**
 * bcrypt silently truncates input at 72 bytes — two passwords sharing the first
 * 72 bytes would hash identically. The auth validator caps length to match, so
 * this constant is the single source of that limit.
 */
export const MAX_PASSWORD_BYTES = 72;

/** Hash a plaintext password. Never store the input. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored hash.
 * Returns false (never throws) on a malformed/empty hash so callers cannot
 * distinguish "bad password" from "bad record" — and cannot crash on one.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}
