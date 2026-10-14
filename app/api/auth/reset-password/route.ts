import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { hashToken } from "@/lib/tokens";
import { resetPasswordSchema, firstError } from "@/lib/validators";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const key = rateLimitKey(request, "reset-password");
  const rl = rateLimit(
    key,
    RATE_LIMITS.resetPassword.limit,
    RATE_LIMITS.resetPassword.windowMs,
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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (
    !reset ||
    reset.scope !== "user" ||
    !reset.userId ||
    reset.usedAt ||
    reset.expiresAt.getTime() <= Date.now()
  ) {
    return Response.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  // Changing the password revokes every existing session — a stolen session
  // must not survive the reset that was meant to lock it out.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
    prisma.userSession.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return Response.json({
    ok: true,
    message: "Password updated. You can now sign in.",
  });
}
