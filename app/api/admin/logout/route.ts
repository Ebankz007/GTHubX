import { logoutAdmin } from "@/lib/auth";

/** POST /api/admin/logout — revoke the admin session and clear its cookie. */
export async function POST() {
  await logoutAdmin();
  return Response.json({ ok: true });
}
