import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/tokens";
import { forgotPasswordSchema, firstError } from "@/lib/validators";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { sendEmail, siteOrigin } from "@/lib/notifications/email";

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
      subject: "Reset your Global Traders HubX password",
      text: `A password reset was requested for your account.\n\nReset it here (expires in 1 hour):\n${link}\n\nIf this wasn't you, you can ignore this email.`,
    });
  }

  return Response.json({
    ok: true,
    message:
      "If an account exists for that email, a reset link has been sent.",
  });
}
