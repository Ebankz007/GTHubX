import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { profileSchema, firstError } from "@/lib/validators";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * PATCH /api/account/profile — self-service profile edit.
 *
 * Deliberately narrow: name, phone, country only. Email changes need a fresh
 * verification cycle; role/status/kyc/sponsor are never client-writable.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const rl = rateLimit(
    `profile:${user.id}`,
    RATE_LIMITS.profileUpdate.limit,
    RATE_LIMITS.profileUpdate.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many updates. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { fullName } = parsed.data;
  const phone = parsed.data.phone?.trim() || null;
  const country = parsed.data.country?.trim() || null;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { fullName, phone, country },
    select: { fullName: true, phone: true, country: true },
  });

  return Response.json({
    ok: true,
    message: "Profile updated.",
    user: updated,
  });
}
