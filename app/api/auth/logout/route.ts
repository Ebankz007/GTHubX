import { logoutUser } from "@/lib/auth";

export async function POST() {
  await logoutUser();
  return Response.json({ ok: true });
}
