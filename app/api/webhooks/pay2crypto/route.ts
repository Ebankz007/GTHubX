import { timingSafeEqual } from "node:crypto";
import { clientIp, rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveGatewayConfig } from "@/lib/payments/gateway";
import { WebhookError, handlePay2CryptoWebhook } from "@/lib/payments/webhook";

/**
 * Pay2Crypto payment confirmation callback.
 *
 * Public by nature — the gateway calls it, so there is no session. The gate is
 * a shared secret sent either as a header or a query parameter, because some
 * gateway webhook configurations cannot send custom headers.
 *
 * **It fails closed.** With no `PAY2CRYPTO_WEBHOOK_SECRET` configured, every
 * request is refused: an unauthenticated payment webhook is an endpoint that
 * lets anyone mark any invoice as paid. A secret comparison is constant-time so
 * it cannot be guessed byte by byte.
 */
function secretsMatch(a: string, b: string): boolean {
  const provided = Buffer.from(a);
  const expected = Buffer.from(b);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  // A generous ceiling: the gateway legitimately retries, but an endpoint that
  // mints money should not be infinitely cheap to hammer.
  const key = rateLimitKey(request, "pay2crypto-webhook");
  const rl = rateLimit(
    key,
    RATE_LIMITS.gatewayWebhook.limit,
    RATE_LIMITS.gatewayWebhook.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { webhookSecret } = resolveGatewayConfig();
  const provided =
    request.headers.get("x-pay2crypto-secret") ??
    new URL(request.url).searchParams.get("secret");

  if (!webhookSecret) {
    console.error(
      "[pay2crypto] webhook received but PAY2CRYPTO_WEBHOOK_SECRET is not set — refusing (fail closed).",
    );
    return Response.json(
      { error: "Webhook is not configured on this deployment." },
      { status: 401 },
    );
  }
  if (!provided || !secretsMatch(provided, webhookSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await handlePay2CryptoWebhook(body);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WebhookError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error(`[pay2crypto] webhook failed from ${clientIp(request)}`, error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
