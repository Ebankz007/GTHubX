import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";
import { payoutActionSchema, firstError } from "@/lib/validators";
import { actOnPayout } from "@/lib/payouts/admin";
import { PayoutError } from "@/lib/payouts/state";

/**
 * Act on one payout: APPROVE, REJECT, or MARK_PAID.
 *
 * The transition rules live in `lib/payouts/state.ts` and are claimed
 * atomically in `lib/payouts/admin.ts` — a racing second action loses the
 * conditional update and gets 409, never a second refund. The audit row is
 * written inside the same transaction: an approval that commits without its
 * trail entry is exactly the case the trail exists to catch.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(admin.role, "withdrawals")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = rateLimitKey(request, "admin-payout-action", admin.id);
  const rl = rateLimit(key, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = payoutActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { action } = parsed.data;

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const acted = await actOnPayout({
        client: tx,
        payoutId: id,
        action,
        adminId: admin.id,
      });

      await recordAudit(
        {
          adminId: admin.id,
          action: `payout.${action === "MARK_PAID" ? "mark-paid" : action.toLowerCase()}`,
          entity: "Payout",
          entityId: id,
          after: {
            status: acted.status,
            refundCents: acted.refundCents,
          },
          ip: clientIp(request),
        },
        tx,
      );

      return acted;
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PayoutError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[payouts] action failed", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
}
