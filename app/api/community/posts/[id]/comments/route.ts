import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createCommentSchema, firstError } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/community/posts/[id]/comments — comment on a visible post.
 *
 * Hidden and removed posts are treated as absent: allowing a comment to
 * thread onto moderated content would resurrect it through the back door.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;

  const rl = rateLimit(`comment:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: "You are commenting too quickly. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const post = await prisma.communityPost.findFirst({
    where: { id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }

  await prisma.communityComment.create({
    data: {
      postId: post.id,
      authorId: user.id,
      body: parsed.data.body,
      status: "PUBLISHED",
    },
  });

  return Response.json({ ok: true, message: "Comment added." }, { status: 201 });
}
