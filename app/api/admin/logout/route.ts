import { logoutAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

/** POST /api/admin/logout — revoke the admin session, clear its cookie, and
 *  send the admin back to the admin login page. */
export async function POST() {
  await logoutAdmin();
  redirect("/admin/login");
}
