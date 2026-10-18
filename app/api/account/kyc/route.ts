import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { kycSubmissionSchema, firstError } from "@/lib/validators";
import { submitKyc } from "@/lib/kyc/submit";
import { KycError } from "@/lib/kyc/state";

/**
 * Submit identity details for review.
 *
 * The member's own account only — the id comes from the session, never from the
 * body, so there is no way to submit on someone else's behalf.
 *
 * No audit row: like a payout request, this is the member's own record and the
 * `KycProfile` row (with `submittedAt`) is the durable, attributable artifact.
 * Audit rows cover the admin decisions that follow.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = rateLimitKey(request, "kyc-submission", user.id);
  const rl = rateLimit(
    key,
    RATE_LIMITS.kycSubmission.limit,
    RATE_LIMITS.kycSubmission.windowMs,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = kycSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { legalName, dateOfBirth, country, address, idType, idNumber } =
    parsed.data;

  try {
    const result = await prisma.$transaction((tx) =>
      submitKyc({
        client: tx,
        userId: user.id,
        facts: { legalName, dateOfBirth, country, address, idType, idNumber },
      }),
    );

    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof KycError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[kyc] submission failed", error);
    return Response.json({ error: "Submission failed" }, { status: 500 });
  }
}
