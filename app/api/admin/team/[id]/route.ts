import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { updateAdminSchema, firstError } from "@/lib/validators";

/**
 * Superadmin edit of an admin account: change role and/or suspend access.
 *
 * The page behind this is guarded by `requireAdminPermission("team")`, but the
 * route re-checks on its own — a UI gate is a convenience, not a boundary.
 *
 * Refused before anything is written:
 *   1. editing your own role or active flag,
 *   2. an empty patch (would write a meaningless audit entry).
 *
 * Also refused: removing the last *active* SUPER_ADMIN. Note that today this
 * third rule is **unreachable** — only SUPER_ADMIN holds `team`, and
 * `getCurrentAdmin` only returns active admins, so an actor editing anyone
 * else always leaves at least themselves standing. It is kept because it
 * becomes load-bearing the moment a non-superadmin role is granted `team`.
 *
 * Deactivating an admin needs no session revocation: `getCurrentAdmin` already
 * refuses inactive admins, so the live cookie goes inert on the next request.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentAdmin();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(actor.role, "team")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateAdminSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) {
    // Never confirms anything about ids outside your reach.
    return Response.json({ error: "Admin not found" }, { status: 404 });
  }

  const nextRole = parsed.data.role ?? target.role;
  const nextActive = parsed.data.isActive ?? target.isActive;
  const roleChanged = nextRole !== target.role;
  const activeChanged = nextActive !== target.isActive;

  if (target.id === actor.id) {
    if (roleChanged) {
      return Response.json(
        { error: "You cannot change your own role." },
        { status: 400 },
      );
    }
    if (activeChanged) {
      return Response.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 },
      );
    }
  }

  // Would this target stop being an active SUPER_ADMIN?
  const losesSuperAdmin =
    target.role === "SUPER_ADMIN" &&
    target.isActive &&
    (nextRole !== "SUPER_ADMIN" || !nextActive);

  if (losesSuperAdmin) {
    const otherActiveSuperAdmins = await prisma.admin.count({
      where: {
        role: "SUPER_ADMIN",
        isActive: true,
        id: { not: target.id },
      },
    });
    if (otherActiveSuperAdmins === 0) {
      return Response.json(
        {
          error:
            "At least one active SUPER_ADMIN must remain. Promote another admin first.",
        },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.admin.update({
    where: { id: target.id },
    data: {
      ...(roleChanged ? { role: nextRole } : {}),
      ...(activeChanged ? { isActive: nextActive } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  await recordAudit({
    adminId: actor.id,
    action:
      roleChanged && activeChanged
        ? "admin.role-and-access"
        : roleChanged
          ? "admin.role-change"
          : "admin.access-change",
    entity: "Admin",
    entityId: target.id,
    before: { role: target.role, isActive: target.isActive },
    after: { role: updated.role, isActive: updated.isActive },
    ip: clientIp(request),
  });

  return Response.json({ ok: true, admin: updated });
}
