import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  rateLimit,
  rateLimitKey,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { requestPayoutSchema, firstError } from "@/lib/validators";
import { requestPayout } from "@/lib/payouts/request";
import { PayoutError } from "@/lib/payouts/state";

/**
 * Request a payout from the member's own wallet.
 *
 * The hold lands here: one transaction creates the REQUESTED payout, debits
 * the wallet conditionally (so concurrent requests cannot overdraw), and
 * writes the append-only `DEBIT/WITHDRAWAL` ledger row. See
 * `lib/payouts/request.ts` for the ordering and why it is safe.
 *
 * No audit row: the ledger entry IS the member-side record, permanent and
 * attributable. Audit rows cover the admin decisions that follow.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = rateLimitKey(request, "payout-request", user.id);
  const rl = rateLimit(
    key,
    RATE_LIMITS.payoutRequest.limit,
    RATE_LIMITS.payoutRequest.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many payout requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestPayoutSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { amountCents, method, destination, details } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await requestPayout({
        client: tx,
        userId: user.id,
        amountCents,
        method,
        destination,
        details: details || undefined,
      });

      const payout = await tx.payout.findUniqueOrThrow({
        where: { id: created.payoutId },
        select: {
          id: true,
          status: true,
          amountCents: true,
          method: true,
          destination: true,
          createdAt: true,
        },
      });

      return { ...created, payout };
    });

    return Response.json({
      ok: true,
      payout: result.payout,
      balanceAfterCents: result.balanceAfterCents,
    });
  } catch (error) {
    if (error instanceof PayoutError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[payouts] request failed", error);
    return Response.json({ error: "Payout request failed" }, { status: 500 });
  }
}
