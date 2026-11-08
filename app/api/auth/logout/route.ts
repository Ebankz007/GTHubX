import { logoutUser } from "@/lib/auth";
import { redirect } from "next/navigation";

/** POST /api/auth/logout — revoke the user session, clear its cookie, and
 *  send the user back to the login page. */
export async function POST() {
  await logoutUser();
  redirect("/login");
}
