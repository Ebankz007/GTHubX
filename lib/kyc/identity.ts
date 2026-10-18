import { createHmac } from "node:crypto";
import { normalizeIdNumber } from "./policy";

/**
 * GTHubX — the document number, and how little of it we keep (Phase 7d).
 *
 * The platform does not store the number a member types. It stores two
 * derivatives, each with exactly one job:
 *
 *   `idNumberHash`   an HMAC-SHA256 keyed with `KYC_ID_PEPPER`, so the same
 *                    person submitting the same document twice is detectable
 *                    without the stored value being reversible.
 *   `idNumberLast4`  the four characters a reviewer or support agent can match
 *                    a member against ("the passport ending 4821").
 *
 * ---------------------------------------------------------------------------
 * Why an HMAC and not a plain SHA-256.
 *
 * The obvious implementation is `sha256(idNumber)`. It is also a half-measure:
 * a document number is short and highly structured, so an attacker holding the
 * digest can enumerate the entire space (a 9-digit number is 10^9 hashes -
 * seconds of work) and recover the value. A digest that can be reversed by
 * brute force is not minimisation, it is obfuscation wearing minimisation's
 * coat. Keying the hash with a secret held outside the database is what makes
 * the stored value useless on its own - which is the entire point of storing a
 * derivative instead of the original.
 *
 * ---------------------------------------------------------------------------
 * Why the key lives in the environment, and what happens without it.
 *
 * `KYC_ID_PEPPER` is a server secret, never in the database and never in a
 * migration. That has one consequence worth stating plainly: when it is absent,
 * `hashIdNumber` returns **null** rather than falling back to an unkeyed digest.
 * A deployment without a pepper loses duplicate detection - a degraded feature -
 * and does not gain a weak hash of sensitive personal information. Failing
 * towards less data is the only acceptable direction here.
 * ---------------------------------------------------------------------------
 */

/**
 * Fold the number to a comparable form before deriving anything from it.
 *
 * Lives in `./policy` rather than here: this module pulls in `node:crypto` and
 * therefore cannot be imported by a client component, while `normalizeIdNumber`
 * is pure and both halves of the pipeline need the same answer. One
 * implementation, so the hash and the last-four can never be computed from
 * differently-shaped inputs.
 */
export { normalizeIdNumber };

/** The last four characters, or null when the value is too short to have any. */
export function idNumberLast4(value: string): string | null {
  const normalized = normalizeIdNumber(value);
  return normalized.length >= 4 ? normalized.slice(-4) : null;
}

/**
 * A keyed digest of the document number, or `null` when no pepper is set.
 *
 * `null` is a deliberate, documented outcome rather than an error: see the
 * header. Callers store whatever comes back, including null.
 */
export function hashIdNumber(value: string): string | null {
  const pepper = process.env.KYC_ID_PEPPER?.trim();
  if (!pepper) return null;

  const normalized = normalizeIdNumber(value);
  if (!normalized) return null;

  return createHmac("sha256", pepper).update(normalized).digest("hex");
}

/**
 * How a reviewer refers to a document number they cannot see.
 *
 * ASCII on purpose. A mask built from bullets (`••••`) is prettier and reads
 * as mojibake the moment it passes through a PowerShell 5.1 console or a
 * `Get-Content` without an explicit encoding - and this string is asserted on
 * by the smoke harness, which is exactly that path.
 */
export function idNumberReference(last4: string | null | undefined): string {
  return last4 ? `ends ${last4}` : "not recorded";
}
