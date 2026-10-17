import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { PaymentStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentActions } from "@/components/admin/payment-actions";

export const metadata = { title: "Payments" };

const FILTERS = ["ALL", ...Object.values(PaymentStatus)] as const;

function statusVariant(s: string) {
  return s === "PAID" ? "success" : s === "PENDING" ? "warning" : "danger";
}

/**
 * Inbound registration payments and their settlement.
 *
 * Confirming a payment is the one place the compensation engine is triggered
 * from (see lib/settlement/registration.ts). The gateway adapters of Phase 7
 * will call the same path, so this queue is not a stopgap — it is the human
 * counterpart to an automated one.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("deposits");

  const { status } = await searchParams;
  const active = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as PaymentStatus | "ALL")
    : "ALL";

  const [payments, counts, pools] = await Promise.all([
    prisma.payment.findMany({
      where: active === "ALL" ? undefined : { status: active },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        paymentRef: true,
        purpose: true,
        amountCents: true,
        platformFeeCents: true,
        currency: true,
        status: true,
        gatewayTxid: true,
        paidAt: true,
        createdAt: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.bonusPool.findMany({
      orderBy: { kind: "asc" },
      select: { kind: true, accruedCents: true, paidCents: true, isSolvent: true, currency: true },
    }),
  ]);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Payments
        </h1>
        <p className="mt-1 text-sm text-muted">
          Registration payments awaiting confirmation. Confirming settles the
          payment: the upline is credited through the compensation engine and
          the rank and leadership pools accrue. <strong>This cannot be undone.</strong>
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/admin/payments" : `/admin/payments?status=${f}`}
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
          <CardTitle>Registration payments</CardTitle>
          <CardDescription>
            Newest first. Deposits appear here once the payment gateway lands in
            Phase 7.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              {active === "ALL"
                ? "No payments yet."
                : `No payments with status ${active}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Member</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Reference</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Amount</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Created</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Settle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        <p className="text-foreground">{p.user.fullName}</p>
                        <p className="text-xs text-faint">{p.user.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs text-muted">{p.paymentRef}</p>
                        <p className="mt-1 text-xs text-faint">{p.purpose}</p>
                        {p.gatewayTxid ? (
                          <p className="mt-1 font-mono text-xs text-faint">{p.gatewayTxid}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <p className="text-foreground">{formatCents(p.amountCents, p.currency)}</p>
                        <p className="text-xs text-faint">
                          fee {formatCents(p.platformFeeCents, p.currency)}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                        {p.paidAt ? (
                          <p className="mt-1 text-xs text-faint">
                            paid {p.paidAt.toLocaleString("en-US", {
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
                        <PaymentActions id={p.id} status={p.status} purpose={p.purpose} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bonus pools</CardTitle>
          <CardDescription>
            Funded by every settled registration. A milestone can only be paid
            from a pool that covers it.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pools.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">No pools yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Pool</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Accrued</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Paid</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Solvent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pools.map((p) => (
                  <tr key={p.kind}>
                    <td className="px-5 py-3 text-foreground">{p.kind}</td>
                    <td className="px-5 py-3">{formatCents(p.accruedCents, p.currency)}</td>
                    <td className="px-5 py-3">{formatCents(p.paidCents, p.currency)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={p.isSolvent ? "success" : "danger"}>
                        {p.isSolvent ? "Solvent" : "Short"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
