import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";
import {
  SettlementError,
  settleRegistrationPayment,
} from "@/lib/settlement/registration";

/**
 * Confirm a pending registration payment.
 *
 * This is the manual-confirmation path: a gateway adapter (Phase 7) and a
 * human matching a bank transfer end up here, so there is exactly one place
 * the compensation engine is triggered from. Confirming settles the payment,
 * credits the upline through the engine and accrues the pools — all inside one
 * transaction, audited in that same transaction.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(admin.role, "deposits")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = rateLimitKey(request, "admin-payment-confirm", admin.id);
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
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { gatewayTxid } = body as { gatewayTxid?: unknown };
  if (gatewayTxid !== undefined && typeof gatewayTxid !== "string") {
    return Response.json({ error: "gatewayTxid must be a string" }, { status: 400 });
  }

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const settled = await settleRegistrationPayment({
        client: tx,
        paymentId: id,
        adminId: admin.id,
        gatewayTxid: typeof gatewayTxid === "string" ? gatewayTxid : null,
      });

      await recordAudit(
        {
          adminId: admin.id,
          action: "payment.confirm-registration",
          entity: "Payment",
          entityId: id,
          after: {
            newMemberId: settled.newMemberId,
            direct: settled.direct,
            generations: settled.generations,
            rankPoolCents: settled.rankPoolCents,
            leadershipPoolCents: settled.leadershipPoolCents,
            platformFeeCents: settled.platformFeeCents,
          },
          ip: clientIp(request),
        },
        tx,
      );

      return settled;
    });

    return Response.json({ ok: true, settlement: result });
  } catch (error) {
    if (error instanceof SettlementError) {
      const status =
        error.code === "payment_not_found" ? 404
        : error.code === "already_settled" ? 409
        : 400;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[payments] confirm failed", error);
    return Response.json({ error: "Settlement failed" }, { status: 500 });
  }
}
