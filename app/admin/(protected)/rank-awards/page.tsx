import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { RankAwardStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RankAwardActions } from "@/components/admin/rank-award-actions";

export const metadata = { title: "Rank awards" };

const FILTERS = ["ALL", ...Object.values(RankAwardStatus)] as const;

function statusVariant(s: string) {
  return s === "PAID"
    ? "success"
    : s === "FLAGGED"
      ? "warning"
      : s === "REJECTED"
        ? "danger"
        : "default";
}

/**
 * Rank milestone awards, newest first.
 *
 * FLAGGED Associate awards are milestones the RANK pool could not fund at
 * settlement time. They clear automatically once enough registrations have
 * re-accrued the pool, or manually here: "Mark paid" pays from the pool's
 * available balance (409 when it does not cover the award — come back
 * later), "Reject" closes it without payment. Leadership rows are physical
 * SKUs and take no pool money.
 */
export default async function AdminRankAwardsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("withdrawals");

  const { status } = await searchParams;
  const active = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as RankAwardStatus | "ALL")
    : "ALL";

  const [awards, counts, pool] = await Promise.all([
    prisma.rankAward.findMany({
      where: active === "ALL" ? undefined : { status: active },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        rankId: true,
        rewardCents: true,
        rewardSku: true,
        status: true,
        paidAt: true,
        createdAt: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
    prisma.rankAward.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.bonusPool.findUnique({
      where: { kind: "RANK" },
      select: { accruedCents: true, paidCents: true, currency: true },
    }),
  ]);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;
  const availableCents = pool ? pool.accruedCents - pool.paidCents : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Rank awards
        </h1>
        <p className="mt-1 text-sm text-muted">
          Milestone rewards recorded by settlement. Flagged awards were not
          covered by the rank pool at the time — they clear automatically as
          the pool re-accrues, or manually here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>RANK pool</CardDescription>
          <CardTitle className="text-2xl">
            {formatCents(availableCents, pool?.currency ?? "USD")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-faint">
            {pool
              ? `Accrued ${formatCents(pool.accruedCents, pool.currency)} · paid ${formatCents(pool.paidCents, pool.currency)}. "Mark paid" pays from this balance only — a short pool refuses with 409 until more registrations accrue.`
              : "No rank pool has been accrued yet."}
          </p>
        </CardContent>
      </Card>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/admin/rank-awards" : `/admin/rank-awards?status=${f}`}
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
          <CardTitle>Milestone awards</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {awards.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              {active === "ALL"
                ? "No rank awards yet — they appear as members qualify through settlement."
                : `No awards with status ${active}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Member</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Award</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Recorded</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {awards.map((a) => (
                    <tr key={a.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        <p className="text-foreground">{a.user.fullName}</p>
                        <p className="text-xs text-faint">{a.user.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-foreground">
                          {a.kind === "ASSOCIATE"
                            ? `Associate rank ${a.rankId}`
                            : `Leadership rank ${a.rankId}`}
                        </p>
                        <p className="text-xs text-faint">
                          {a.kind === "ASSOCIATE" && a.rewardCents !== null
                            ? formatCents(a.rewardCents)
                            : (a.rewardSku ?? "SKU")}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                        {a.paidAt ? (
                          <p className="mt-1 text-xs text-faint">
                            paid {a.paidAt.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {a.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <RankAwardActions id={a.id} status={a.status} kind={a.kind} />
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
