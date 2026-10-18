/**
 * In-memory fixed-window rate limiter.
 *
 * Scope: correct for a single long-lived Node process (PM2 / `next start`).
 * It is NOT shared across instances — if GTHubX is ever horizontally scaled,
 * swap the `buckets` map for Redis behind the same `rateLimit()` signature.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Opportunistic sweep so the map cannot grow without bound. */
const SWEEP_THRESHOLD = 5_000;

function sweep(now: number): void {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Consume one unit for `key`. Returns whether the call is allowed and, if not,
 * how long until the window resets.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Reset a bucket — call after a successful login so a good password clears the counter. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Best-effort client identity for keying. Behind a proxy, trust the first XFF hop. */
export function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export function rateLimitKey(request: Request, scope: string, extra = ""): string {
  return `${scope}:${clientIp(request)}${extra ? `:${extra}` : ""}`;
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  forgotPassword: { limit: 5, windowMs: 60 * 60 * 1000 },
  resetPassword: { limit: 10, windowMs: 60 * 60 * 1000 },
  verifyEmail: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Payout requests move money out of a wallet — 10/hour is far above any
   *  human cadence and caps the damage of a compromised session. */
  payoutRequest: { limit: 10, windowMs: 60 * 60 * 1000 },
  profileUpdate: { limit: 20, windowMs: 15 * 60 * 1000 },
  /** Tighter than member login — the admin surface is a smaller, better-defined target. */
  adminLogin: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** Each call may issue a gateway invoice, so it is bounded per member. */
  checkoutRequest: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** The gateway legitimately retries; this only blunts brute force on the secret. */
  gatewayWebhook: { limit: 300, windowMs: 15 * 60 * 1000 },
  /** A member submits once; resubmissions after a rejection are rare and
   *  deliberate. 10/hour is far above any honest cadence. */
  kycSubmission: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** A reviewer works a queue, so this is a ceiling on a burst, not a budget:
   *  60 decisions per quarter-hour. */
  kycDecision: { limit: 60, windowMs: 15 * 60 * 1000 },
} as const;
