import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { updateCommunityCommentSchema, firstError } from "@/lib/validators";
import type { PostStatus } from "@/lib/generated/prisma/enums";

/**
 * Moderate a community comment: visibility only (a comment cannot be pinned).
 *
 * Same non-destructive contract as post moderation — `REMOVED` hides the
 * comment from the member feed without deleting the row, and the member side
 * already filters comments on `status: "PUBLISHED"`.
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

  const parsed = updateCommunityCommentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const comment = await prisma.communityComment.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!comment) {
    return Response.json({ error: "Comment not found" }, { status: 404 });
  }

  const nextStatus = parsed.data.status as PostStatus;

  if (comment.status === nextStatus) {
    return Response.json({ ok: true, changed: false, id: comment.id });
  }

  const updated = await prisma.communityComment.update({
    where: { id: comment.id },
    data: { status: nextStatus },
    select: { id: true, status: true },
  });

  await recordAudit({
    adminId: actor.id,
    action: "community.comment-status",
    entity: "CommunityComment",
    entityId: comment.id,
    before: { status: comment.status },
    after: { status: updated.status },
    ip: clientIp(request),
  });

  return Response.json({ ok: true, changed: true, comment: updated });
}
