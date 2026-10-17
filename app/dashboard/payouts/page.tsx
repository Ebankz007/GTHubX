import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayoutRequest } from "@/components/dashboard/payout-request";

export const metadata = { title: "Payouts" };

function statusVariant(s: string) {
  return s === "PAID"
    ? "success"
    : s === "REQUESTED"
      ? "warning"
      : s === "REJECTED"
        ? "danger"
        : "default";
}

/**
 * Request a payout and track it.
 *
 * Money model, stated once where the member can read it: requesting holds
 * the amount out of your free balance immediately; a rejection returns it;
 * approval and delivery never touch the balance again. So the balance on
 * this page is always what you can spend right now.
 */
export default async function PayoutsPage() {
  const user = await requireUser();

  const [wallet, payouts] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.payout.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const balanceCents = wallet?.balanceCents ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-muted">
          Request a withdrawal of your free balance and track it through review.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Free balance</CardDescription>
          <CardTitle className="text-2xl">
            {formatCents(balanceCents, wallet?.currency ?? "USD")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PayoutRequest balanceCents={balanceCents} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your payout requests</CardTitle>
          <CardDescription>
            A request holds its amount immediately. Rejecting returns the
            funds; delivery records that the payout was sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              No payout requests yet.{" "}
              <Link href="/dashboard/transactions" className="text-brand">
                See your transactions
              </Link>{" "}
              for every credit and debit on the account.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Requested
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Amount
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Method
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payouts.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-elevated/50">
                      <td className="whitespace-nowrap px-5 py-3 text-faint">
                        {p.createdAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-foreground">
                        {formatCents(p.amountCents, p.currency)}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {p.method.replace(/_/g, " ")}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                        {p.paidAt ? (
                          <p className="mt-1 text-xs text-faint">
                            delivered {p.paidAt.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
