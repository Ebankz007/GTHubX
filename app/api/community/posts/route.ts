import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createPostSchema, firstError } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";

/** POST /api/community/posts — publish a post to the member feed. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const rl = rateLimit(`post:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: "You are posting too quickly. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const post = await prisma.communityPost.create({
    data: {
      authorId: user.id,
      title: parsed.data.title || null,
      body: parsed.data.body,
      status: "PUBLISHED",
    },
  });

  return Response.json(
    { ok: true, id: post.id, message: "Post published." },
    { status: 201 },
  );
}
