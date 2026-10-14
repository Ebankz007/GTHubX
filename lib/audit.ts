import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export type AuditInput = {
  adminId?: string | null;
  /** Verb, e.g. "user.suspend", "payout.approve". */
  action: string;
  /** Entity type, e.g. "User", "Payout". */
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
};

/**
 * Append an audit record for a sensitive admin/financial action.
 *
 * Throws on failure — an audit trail that silently drops entries is worse than
 * no trail, because it looks complete. Callers that must not fail on audit
 * should catch explicitly.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminId: input.adminId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before,
      after: input.after,
      ip: input.ip ?? null,
    },
  });
}
