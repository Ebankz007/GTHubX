import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { updateCommunityPostSchema, firstError } from "@/lib/validators";
import type { PostStatus } from "@/lib/generated/prisma/enums";

/**
 * Moderate a community post: visibility (PUBLISHED / HIDDEN / REMOVED) and pin.
 *
 * Moderation never deletes anything. `REMOVED` hides a post from members the
 * same way `HIDDEN` does, but the row survives and can be restored — so this
 * endpoint carries no destructive operation and needs no "are you sure" gate.
 * The member feed already filters on `status: "PUBLISHED"`, so the change takes
 * effect on the member's very next request with no member-side code involved.
 *
 * The page behind this is guarded too, but a UI gate is a convenience, not a
 * boundary — this route re-checks `community` itself.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentAdmin();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(actor.role, "community")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateCommunityPostSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const post = await prisma.communityPost.findUnique({
    where: { id },
    select: { id: true, status: true, isPinned: true },
  });
  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }

  // Zod infers `string` from the derived list; Prisma wants the enum member.
  const nextStatus = (parsed.data.status ?? post.status) as PostStatus;
  const nextPinned = parsed.data.isPinned ?? post.isPinned;
  const statusChanged = nextStatus !== post.status;
  const pinnedChanged = nextPinned !== post.isPinned;

  if (!statusChanged && !pinnedChanged) {
    return Response.json({ ok: true, changed: false, id: post.id });
  }

  const updated = await prisma.communityPost.update({
    where: { id: post.id },
    data: {
      ...(statusChanged ? { status: nextStatus } : {}),
      ...(pinnedChanged ? { isPinned: nextPinned } : {}),
    },
    select: { id: true, status: true, isPinned: true },
  });

  await recordAudit({
    adminId: actor.id,
    action: statusChanged
      ? "community.post-status"
      : "community.post-pin",
    entity: "CommunityPost",
    entityId: post.id,
    before: { status: post.status, isPinned: post.isPinned },
    after: { status: updated.status, isPinned: updated.isPinned },
    ip: clientIp(request),
  });

  return Response.json({ ok: true, changed: true, post: updated });
}
