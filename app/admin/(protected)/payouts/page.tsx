import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { PayoutStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayoutActions } from "@/components/admin/payout-actions";

export const metadata = { title: "Payouts" };

const FILTERS = ["ALL", ...Object.values(PayoutStatus)] as const;

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
 * Outbound payout queue.
 *
 * Money semantics, stated once: a request HOLDs the amount out of the
 * member's wallet immediately (ledger `DEBIT/WITHDRAWAL`). Reject refunds
 * that hold (`CREDIT/REFUND`). Approve and Mark paid move no money — Mark
 * paid only records that the operator delivered the funds externally.
 * See `lib/payouts/state.ts` for the transition matrix.
 */
export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("withdrawals");

  const { status } = await searchParams;
  const active = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as PayoutStatus | "ALL")
    : "ALL";

  const [payouts, counts] = await Promise.all([
    prisma.payout.findMany({
      where: active === "ALL" ? undefined : { status: active },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        amountCents: true,
        currency: true,
        status: true,
        method: true,
        destination: true,
        details: true,
        approvedAt: true,
        paidAt: true,
        createdAt: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
    prisma.payout.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;
  const totals = {
    requested: counts.find((c) => c.status === "REQUESTED")?._count._all ?? 0,
    heldCents: payouts.reduce(
      (sum, p) => (p.status === "REQUESTED" ? sum + p.amountCents : sum),
      0,
    ),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-muted">
          Member withdrawal requests. Requesting already debited the member&apos;s
          wallet — Reject refunds that hold, Approve and Mark paid move no
          money (Mark paid records that you delivered the funds).
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/admin/payouts" : `/admin/payouts?status=${f}`}
            className={
              f === active
                ? "rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-background"
                : "rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-elevated"
            }
          >
            {f === "ALL" ? "All" : `${f} (${countFor(f)})`}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal requests</CardTitle>
          <CardDescription>
            {totals.requested} awaiting review. New requests appear here the
            moment a member submits one.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              {active === "ALL"
                ? "No payout requests yet."
                : `No payouts with status ${active}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Member</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Amount</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Method / destination</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Requested</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payouts.map((p) => (
                    <tr key={p.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        <p className="text-foreground">{p.user.fullName}</p>
                        <p className="text-xs text-faint">{p.user.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-foreground">
                        {formatCents(p.amountCents, p.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-foreground">{p.method.replace(/_/g, " ")}</p>
                        <p className="max-w-[16rem] truncate text-xs text-faint">
                          {p.destination ?? "—"}
                        </p>
                        {p.details ? (
                          <p className="mt-0.5 max-w-[16rem] truncate text-xs text-faint">{p.details}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                        {p.paidAt ? (
                          <p className="mt-1 text-xs text-faint">
                            delivered {p.paidAt.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {p.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <PayoutActions id={p.id} status={p.status} />
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
