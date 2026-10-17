import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { CheckoutError, refreshRegistrationCheckout } from "@/lib/payments/checkout";
import { PaymentGatewayError } from "@/lib/payments/pay2crypto";

/**
 * Get a live checkout link for the member's registration invoice.
 *
 * The member never supplies an amount or a reference — the server owns both.
 * `refreshRegistrationCheckout` returns the existing link when it is still
 * fresh and issues a new invoice when it is not, so a member can always pay
 * without an operator touching anything.
 *
 * The response may name a DIFFERENT payment id than the one requested: a
 * refresh expires the stale row and creates a new one (see lib/payments/checkout.ts
 * for why the reference is never rewritten in place).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = rateLimitKey(request, "checkout-request", user.id);
  const rl = rateLimit(
    key,
    RATE_LIMITS.checkoutRequest.limit,
    RATE_LIMITS.checkoutRequest.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many checkout attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { id } = await params;

  // Ownership is checked before anything else — a member must not be able to
  // probe or refresh somebody else's invoice.
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { id: true, userId: true, purpose: true },
  });
  if (!payment || payment.userId !== user.id) {
    return Response.json({ error: "Payment not found" }, { status: 404 });
  }
  if (payment.purpose !== "REGISTRATION") {
    return Response.json(
      { error: "Only a registration invoice can be checked out from here." },
      { status: 409 },
    );
  }

  try {
    const checkout = await refreshRegistrationCheckout(user.id);
    return Response.json({ ok: true, checkout });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof PaymentGatewayError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error(`[payments] checkout failed for ${clientIp(request)}`, error);
    return Response.json({ error: "Could not open a checkout." }, { status: 500 });
  }
}
