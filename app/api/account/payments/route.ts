import { getCurrentUser } from "@/lib/auth";
import { listMyPayments } from "@/lib/payments/checkout";

/**
 * The member's own payment history.
 *
 * Read-only: invoices are created by the registration flow and refreshed by
 * the checkout endpoint, never posted into existence by a member.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payments = await listMyPayments(user.id);
  return Response.json({ payments });
}
