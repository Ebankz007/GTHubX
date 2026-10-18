import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { verifyEmailSchema, firstError } from "@/lib/validators";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { writeInAppNotification } from "@/lib/notifications/in-app";

export async function POST(request: Request) {
  const key = rateLimitKey(request, "verify-email");
  const rl = rateLimit(
    key,
    RATE_LIMITS.verifyEmail.limit,
    RATE_LIMITS.verifyEmail.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: true },
  });

  if (
    !session ||
    session.purpose !== "EMAIL_VERIFY" ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return Response.json(
      { error: "This verification link is invalid or has expired." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.userId },
      data: {
        emailVerifiedAt: new Date(),
        status: session.user.status === "PENDING" ? "ACTIVE" : session.user.status,
      },
    }),
    prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeInAppNotification({
    userId: session.userId,
    type: "ACCOUNT",
    title: "Email verified",
    body: "Your email address has been verified.",
    link: "/dashboard",
  });

  return Response.json({
    ok: true,
    message: "Email verified. You can now sign in.",
  });
}
