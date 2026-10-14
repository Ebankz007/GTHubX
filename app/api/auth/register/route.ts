import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { registerSchema, firstError } from "@/lib/validators";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { sendEmail, siteOrigin } from "@/lib/notifications/email";

const VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export async function POST(request: Request) {
  const key = rateLimitKey(request, "register");
  const rl = rateLimit(key, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs);
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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { fullName, email, password, phone, country, referralCode } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  // Referral code is the sponsor's user id (a vanity code is a later refinement).
  let sponsorId: string | null = null;
  if (referralCode) {
    const sponsor = await prisma.user.findUnique({
      where: { id: referralCode },
      select: { id: true },
    });
    sponsorId = sponsor?.id ?? null;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      phone: phone || null,
      country: country || null,
      sponsorId,
      status: "PENDING",
    },
  });

  // Verification token, stored hashed as a purpose-scoped session row.
  const token = generateToken();
  await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: "EMAIL_VERIFY",
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });

  const link = `${siteOrigin()}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your Global Traders HubX email",
    text: `Welcome to Global Traders HubX.\n\nVerify your email to activate your account:\n${link}\n\nThis link expires in 24 hours.`,
  });

  return Response.json(
    { ok: true, message: "Check your email to verify your account." },
    { status: 201 },
  );
}
