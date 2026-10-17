import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";
import { rankAwardActionSchema, firstError } from "@/lib/validators";
import { actOnRankAward, RankAwardError } from "@/lib/settlement/rank-admin";

/**
 * Act on one rank award: MARK_PAID (clear a flagged award from the RANK
 * pool, if it covers it) or REJECT (close it without payment).
 *
 * Rules and the race guards live in `lib/settlement/rank-admin.ts`; this
 * route owns auth (`withdrawals`), rate limiting and the audit row, which is
 * written inside the same transaction as the action itself.
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

  const key = rateLimitKey(request, "admin-award-action", admin.id);
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

  const parsed = rankAwardActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { action } = parsed.data;

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const acted = await actOnRankAward({
        client: tx,
        awardId: id,
        action,
      });

      await recordAudit(
        {
          adminId: admin.id,
          action: `rank-award.${action === "MARK_PAID" ? "mark-paid" : "reject"}`,
          entity: "RankAward",
          entityId: id,
          after: {
            status: acted.status,
            paidCents: acted.paidCents,
            poolAvailableCents: acted.poolAvailableCents,
          },
          ip: clientIp(request),
        },
        tx,
      );

      return acted;
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RankAwardError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[rank-awards] action failed", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
}
