import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";
import { kycDecisionSchema, firstError } from "@/lib/validators";
import { decideKyc } from "@/lib/kyc/review";
import { KycError } from "@/lib/kyc/state";
import { notifyKycDecision } from "@/lib/notifications/member";

/**
 * Decide one KYC submission: VERIFY or REJECT (with a reason).
 *
 * Auth is the `kyc` permission — the same one the review queue requires, held by
 * SUPPORT_ADMIN and SUPER_ADMIN. The rules live in `lib/kyc/review.ts`; this
 * route owns the permission check, rate limiting and the audit row, which is
 * written **inside the decision's transaction** so an approval cannot commit
 * without its trail.
 *
 * The member's email is sent after the commit, never inside it: the decision is
 * durable before anyone is told about it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(admin.role, "kyc")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = rateLimitKey(request, "admin-kyc-decision", admin.id);
  const rl = rateLimit(
    key,
    RATE_LIMITS.kycDecision.limit,
    RATE_LIMITS.kycDecision.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many decisions. Please try again later." },
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

  const parsed = kycDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { action, reason } = parsed.data;

  const { id } = await params;

  try {
    const decided = await prisma.$transaction(async (tx) => {
      const result = await decideKyc({
        client: tx,
        profileId: id,
        action,
        reason: reason ?? null,
        adminId: admin.id,
      });

      await recordAudit(
        {
          adminId: admin.id,
          action: `kyc.${action === "VERIFY" ? "verify" : "reject"}`,
          entity: "KycProfile",
          entityId: id,
          before: { status: result.previous },
          after: { status: result.status, reason: action === "REJECT" ? reason : null },
          ip: clientIp(request),
        },
        tx,
      );

      return result;
    });

    await notifyKycDecision({
      kycProfileId: id,
      action,
      reason: reason ?? null,
    });

    return Response.json({ ok: true, status: decided.status });
  } catch (error) {
    if (error instanceof KycError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[kyc] decision failed", error);
    return Response.json({ error: "Decision failed" }, { status: 500 });
  }
}
