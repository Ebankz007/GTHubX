import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { registerSchema, firstError } from "@/lib/validators";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/notifications/email";
import { verifyEmailTemplate } from "@/lib/notifications/templates";
import { siteName, siteOrigin } from "@/lib/site";
import { attachCheckoutToPayment } from "@/lib/payments/checkout";
import { PLATFORM_FEE_CENTS, REGISTRATION_GROSS_CENTS } from "@/lib/engine";

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

  // Account, wallet and the registration payment are one unit: a member with a
  // user row but no wallet and no payment cannot ever be settled. The
  // verification token joins them; the email is sent after the commit, because
  // an email must never be able to roll back an account.
  const verifyToken = generateToken();
  const paymentRef = `REG-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;

  const registration = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
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

    await tx.wallet.create({ data: { userId: created.id, balanceCents: 0 } });

    // Charged but not yet paid. Commissions accrue only when this payment is
    // confirmed — never at signup (see lib/settlement/registration.ts).
    const payment = await tx.payment.create({
      data: {
        userId: created.id,
        purpose: "REGISTRATION",
        amountCents: REGISTRATION_GROSS_CENTS,
        platformFeeCents: PLATFORM_FEE_CENTS,
        currency: "USDT",
        status: "PENDING",
        paymentRef,
      },
      select: { id: true },
    });

    await tx.userSession.create({
      data: {
        userId: created.id,
        tokenHash: hashToken(verifyToken),
        purpose: "EMAIL_VERIFY",
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });

    return { created, paymentId: payment.id };
  });

  const link = `${siteOrigin()}/verify-email?token=${verifyToken}`;
  await sendEmail({
    to: email,
    // The stated lifetime is derived from the token's real TTL, so the email
    // cannot promise a longer life than the row it links to.
    ...verifyEmailTemplate({
      siteName: siteName(),
      name: fullName,
      url: link,
      ttlHours: VERIFY_TTL_MS / 3_600_000,
    }),
  });

  // Open the payment checkout now, so the member's registration page has a
  // live link the moment they land on it. Best effort and AFTER the commit:
  // neither an email nor a payment gateway may roll back an account, and the
  // member can always ask for a checkout on demand from the dashboard.
  await attachCheckoutToPayment({
    paymentId: registration.paymentId,
    amountCents: REGISTRATION_GROSS_CENTS,
    purpose: "REGISTRATION",
  });

  return Response.json(
    { ok: true, message: "Check your email to verify your account." },
    { status: 201 },
  );
}
