import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dailySeries, DAY_MS } from "@/lib/reports";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Reports" };

const RANGES = [7, 30, 90] as const;

function Breakdown({
  rows,
  total,
}: {
  rows: { label: string; count: number; tone?: string }[];
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted">{r.label}</span>
            <span className="tabular-nums text-foreground">
              {r.count.toLocaleString("en-US")}
              <span className="ml-2 text-xs text-faint">
                {total > 0 ? `${((r.count / total) * 100).toFixed(1)}%` : "—"}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className={r.tone ?? "h-full rounded-full bg-brand"}
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Series({ points }: { points: { label: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const sum = points.reduce((a, p) => a + p.count, 0);
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]">
        {points.map((p) => (
          <div
            key={p.label}
            title={`${p.label}: ${p.count}`}
            className="flex-1 rounded-t-sm bg-brand/80 transition-opacity hover:opacity-70"
            style={{
              height: `${Math.max(p.count > 0 ? 4 : 1, (p.count / max) * 100)}%`,
              background: p.count === 0 ? "var(--color-border)" : undefined,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
      <p className="mt-2 text-xs text-faint">
        {sum.toLocaleString("en-US")} total in this range · peak {max.toLocaleString("en-US")} in a day
      </p>
    </div>
  );
}

/**
 * Reports: breakdowns and trends over data that already exists.
 *
 * Deliberately different from the dashboard — that page answers "what is true
 * right now", this one answers "how has it moved". Everything here is computed
 * from real rows; nothing is illustrative.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdminPermission("reports");

  const { days: daysRaw } = await searchParams;
  const parsedDays = Number.parseInt(daysRaw ?? "", 10);
  const days = (RANGES as readonly number[]).includes(parsedDays)
    ? parsedDays
    : 30;
  const since = new Date(Date.now() - days * DAY_MS);

  const [
    statusCounts,
    roleCounts,
    kycCounts,
    countryGroups,
    signups,
    verifiedCount,
    referredCount,
    ticketsByStatus,
    ticketsByPriority,
    oldestOpen,
    postsByStatus,
    commentsByStatus,
    auditByAction,
    auditInRange,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["kycStatus"], _count: { _all: true } }),
    prisma.user.groupBy({
      by: ["country"],
      _count: { _all: true },
      where: { country: { not: null } },
      orderBy: { _count: { country: "desc" } },
      take: 8,
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { sponsorId: { not: null } } }),
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.supportTicket.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.supportTicket.findFirst({
      where: { status: { in: ["OPEN", "PENDING"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, subject: true },
    }),
    prisma.communityPost.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.communityComment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.auditLog.groupBy({
      by: ["action"],
      _count: { _all: true },
      where: { createdAt: { gte: since } },
      orderBy: { _count: { action: "desc" } },
      take: 8,
    }),
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
  ]);

  const totalMembers = statusCounts.reduce((a, r) => a + r._count._all, 0);
  const totalTickets = ticketsByStatus.reduce((a, r) => a + r._count._all, 0);
  const totalPosts = postsByStatus.reduce((a, r) => a + r._count._all, 0);
  const totalComments = commentsByStatus.reduce((a, r) => a + r._count._all, 0);

  const toneForStatus = (s: string) =>
    s === "ACTIVE" || s === "PUBLISHED" || s === "VERIFIED"
      ? "bg-emerald-500"
      : s === "PENDING" || s === "HIDDEN"
        ? "bg-warning"
        : "bg-danger";

  const statusRows = ["ACTIVE", "PENDING", "SUSPENDED"].map((s) => ({
    label: s.charAt(0) + s.slice(1).toLowerCase(),
    count: statusCounts.find((r) => r.status === s)?._count._all ?? 0,
    tone: toneForStatus(s),
  }));

  const kycRows = ["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED"].map((s) => ({
    label: s.replace("_", " ").toLowerCase(),
    count: kycCounts.find((r) => r.kycStatus === s)?._count._all ?? 0,
    tone: toneForStatus(s),
  }));

  const ticketRows = ["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((s) => ({
    label: s.charAt(0) + s.slice(1).toLowerCase(),
    count: ticketsByStatus.find((r) => r.status === s)?._count._all ?? 0,
  }));

  const oldestOpenDays = oldestOpen
    ? Math.floor((Date.now() - oldestOpen.createdAt.getTime()) / DAY_MS)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted">
            Computed from live rows. The dashboard shows what is true now; this shows
            how it moved.
          </p>
        </div>
        {/*
          The active range lives in a data attribute rather than only in the
          sentence beside it: React splits interpolated text with comment nodes
          in server-rendered HTML, so the prose is awkward to assert against.
        */}
        <nav aria-label="Date range" data-range={days} className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin/reports?days=${r}`}
              className={
                r === days
                  ? "rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-background"
                  : "rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-elevated"
              }
            >
              {r}d
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Membership</CardTitle>
            <CardDescription>All-time totals by account status</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 font-display text-3xl font-bold text-foreground">
              {totalMembers.toLocaleString("en-US")}
            </p>
            <Breakdown rows={statusRows} total={totalMembers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification</CardTitle>
            <CardDescription>KYC state across all members</CardDescription>
          </CardHeader>
          <CardContent>
            <Breakdown rows={kycRows} total={totalMembers} />
            <p className="mt-4 text-xs text-faint">
              {verifiedCount.toLocaleString("en-US")} of{" "}
              {totalMembers.toLocaleString("en-US")} have a verified email ·{" "}
              {referredCount.toLocaleString("en-US")} joined with a referrer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account roles</CardTitle>
            <CardDescription>Client, trader and admin split</CardDescription>
          </CardHeader>
          <CardContent>
            <Breakdown
              rows={roleCounts.map((r) => ({
                label: r.role,
                count: r._count._all,
              }))}
              total={totalMembers}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>New signups</CardTitle>
            <CardDescription>Last {days} days, by UTC calendar day</CardDescription>
          </CardHeader>
          <CardContent>
            <Series points={dailySeries(signups.map((s) => s.createdAt), days)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top countries</CardTitle>
            <CardDescription>Members with a country on file</CardDescription>
          </CardHeader>
          <CardContent>
            {countryGroups.length === 0 ? (
              <p className="text-sm text-faint">No member has recorded a country yet.</p>
            ) : (
              <Breakdown
                rows={countryGroups.map((g) => ({
                  label: g.country ?? "—",
                  count: g._count._all,
                }))}
                total={totalMembers}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Support queue</CardTitle>
            <CardDescription>
              {totalTickets.toLocaleString("en-US")} ticket
              {totalTickets === 1 ? "" : "s"} ever
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Breakdown rows={ticketRows} total={totalTickets} />
            <p className="mt-4 text-xs text-faint">
              {oldestOpen
                ? `Oldest open ticket: ${oldestOpenDays} day${oldestOpenDays === 1 ? "" : "s"} — “${oldestOpen.subject}”`
                : "Nothing waiting in the queue."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ticket priority</CardTitle>
            <CardDescription>How work is being raised</CardDescription>
          </CardHeader>
          <CardContent>
            <Breakdown
              rows={["URGENT", "HIGH", "NORMAL", "LOW"].map((p) => ({
                label: p.charAt(0) + p.slice(1).toLowerCase(),
                count:
                  ticketsByPriority.find((r) => r.priority === p)?._count._all ?? 0,
              }))}
              total={totalTickets}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Community</CardTitle>
            <CardDescription>
              {totalPosts.toLocaleString("en-US")} posts ·{" "}
              {totalComments.toLocaleString("en-US")} comments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Breakdown
              rows={["PUBLISHED", "HIDDEN", "REMOVED"].map((s) => ({
                label: s.charAt(0) + s.slice(1).toLowerCase(),
                count:
                  (postsByStatus.find((r) => r.status === s)?._count._all ?? 0) +
                  (commentsByStatus.find((r) => r.status === s)?._count._all ?? 0),
                tone: toneForStatus(s),
              }))}
              total={totalPosts + totalComments}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <CardTitle>Admin activity</CardTitle>
              <CardDescription>
                {auditInRange.toLocaleString("en-US")} audited action
                {auditInRange === 1 ? "" : "s"} in the last {days} days
              </CardDescription>
            </div>
            <Link href="/admin/audit" className="text-sm text-brand">
              Open audit log →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {auditByAction.length === 0 ? (
            <p className="text-sm text-faint">No audited actions in this range.</p>
          ) : (
            <Breakdown
              rows={auditByAction.map((a) => ({
                label: a.action,
                count: a._count._all,
              }))}
              total={auditInRange}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-faint">
        <Badge variant="outline" className="mr-2">
          Live data
        </Badge>
        Every figure above is aggregated from the database on each page load. Nothing on
        this page is sample or illustrative data.
      </p>
    </div>
  );
}
