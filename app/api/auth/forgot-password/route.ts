import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/tokens";
import { forgotPasswordSchema, firstError } from "@/lib/validators";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/notifications/email";
import { writeInAppNotification } from "@/lib/notifications/in-app";
import { passwordResetTemplate } from "@/lib/notifications/templates";
import { siteName, siteOrigin } from "@/lib/site";

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

export async function POST(request: Request) {
  const key = rateLimitKey(request, "forgot-password");
  const rl = rateLimit(
    key,
    RATE_LIMITS.forgotPassword.limit,
    RATE_LIMITS.forgotPassword.windowMs,
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

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Only do work when the account exists, but ALWAYS return the same response —
  // otherwise the endpoint becomes an account-existence oracle.
  if (user) {
    const token = generateToken();
    await prisma.passwordReset.create({
      data: {
        email,
        scope: "user",
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const link = `${siteOrigin()}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      ...passwordResetTemplate({
        siteName: siteName(),
        url: link,
        ttlMinutes: RESET_TTL_MS / 60_000,
      }),
    });
    await writeInAppNotification({
      userId: user.id,
      type: "SECURITY",
      title: "Password reset requested",
      body: "A password reset was requested for your account.",
      link: "/reset-password?token=" + token,
    });
  }

  return Response.json({
    ok: true,
    message:
      "If an account exists for that email, a reset link has been sent.",
  });
}
