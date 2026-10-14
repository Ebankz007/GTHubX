import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginSchema, firstError } from "@/lib/validators";
import {
  rateLimit,
  rateLimitKey,
  resetRateLimit,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  createUserSession,
  setUserSessionCookie,
  sessionMeta,
} from "@/lib/auth";

/**
 * A real bcrypt hash to compare against when the email is unknown, so a missing
 * account and a wrong password take the same time (no user enumeration).
 */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("timing-equalisation-placeholder");
  return dummyHash;
}

export async function POST(request: Request) {
  const key = rateLimitKey(request, "login");
  const rl = rateLimit(key, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const hash = user?.passwordHash ?? (await getDummyHash());
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (user.status === "SUSPENDED") {
    return Response.json(
      { error: "This account has been suspended." },
      { status: 403 },
    );
  }

  const { token, expiresAt } = await createUserSession(
    user.id,
    sessionMeta(request),
  );
  await setUserSessionCookie(token, expiresAt);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  resetRateLimit(key);

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
  });
}
