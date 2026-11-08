import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getCurrentAdmin } from "@/lib/auth";
import { passwordSchema } from "@/lib/validators";
import { z } from "zod";

export const runtime = "nodejs";

/** POST /api/admin/change-password — change the signed-in admin's password.
 *
 * Verifies the current password first, then hashes and stores the new one.
 * Rate limiting is not applied here because the caller must already hold a
 * valid admin session cookie — the session itself is the gate.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = z
    .object({
      currentPassword: z.string().min(1, "Enter your current password"),
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, "Confirm your new password"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirmation do not match.",
      path: ["confirmPassword"],
    })
    .safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  // Load the stored hash to verify the current password.
  const stored = await prisma.admin.findUnique({
    where: { id: admin.id },
    select: { passwordHash: true },
  });
  if (!stored || !stored.passwordHash) {
    return Response.json({ error: "Account has no password on file." }, { status: 400 });
  }

  const valid = await verifyPassword(currentPassword, stored.passwordHash);
  if (!valid) {
    return Response.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash: newHash },
  });

  return Response.json({ ok: true });
}
