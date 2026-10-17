import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Overview" };

const kycCopy = {
  NOT_STARTED: {
    title: "Verification not started",
    body: "Complete identity verification to unlock the full platform.",
    action: "/dashboard/verification",
    cta: "Start verification",
  },
  PENDING: {
    title: "Verification in review",
    body: "Your documents are with our review team. We will notify you when this changes.",
    action: "/dashboard/verification",
    cta: "View submission",
  },
  VERIFIED: {
    title: "Identity verified",
    body: "Your account is fully verified.",
    action: "/dashboard/verification",
    cta: "View details",
  },
  REJECTED: {
    title: "Verification needs attention",
    body: "Your submission could not be accepted. Review the reason and resubmit.",
    action: "/dashboard/verification",
    cta: "Review and resubmit",
  },
} as const;

export default async function DashboardPage() {
  const user = await requireUser();

  // All counts are read from the real schema. Nothing here is illustrative.
  const [wallet, sponsor, downline, unread, recent, openTickets] =
    await Promise.all([
      prisma.wallet.findUnique({ where: { userId: user.id } }),
      user.sponsorId
        ? prisma.user.findUnique({
            where: { id: user.sponsorId },
            select: { fullName: true },
          })
        : Promise.resolve(null),
      prisma.user.count({ where: { sponsorId: user.id } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.ledgerEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.supportTicket.count({
        where: { userId: user.id, status: "OPEN" },
      }),
    ]);

  const kyc = kycCopy[user.kycStatus];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Welcome back, {user.fullName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted">{user.email}</p>
      </div>

      {!user.emailVerifiedAt && (
        <div className="card border-warning/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground">Confirm your email</p>
              <p className="mt-1 text-sm text-muted">
                We sent a verification link to {user.email}. It expires in 24 hours.
              </p>
            </div>
            <Link
              href="/verify-email"
              className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Resend link
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Wallet balance</CardDescription>
            <CardTitle className="text-2xl">
              {wallet ? formatCents(wallet.balanceCents, wallet.currency) : "$0.00"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-faint">
              {wallet
                ? `Updated ${wallet.updatedAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}`
                : "No wallet has been opened on this account yet."}
            </p>
            <Link
              href="/dashboard/payouts"
              className="mt-3 inline-block text-sm text-brand"
            >
              Request a payout →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Your network</CardDescription>
            <CardTitle className="text-2xl">
              {downline} {downline === 1 ? "member" : "members"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-faint">
              {sponsor
                ? `Referred by ${sponsor.fullName}`
                : "No sponsor recorded on this account."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className={user.kycStatus === "VERIFIED" ? "" : "border-warning/40"}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>{kyc.title}</CardTitle>
            <Badge
              variant={
                user.kycStatus === "VERIFIED"
                  ? "success"
                  : user.kycStatus === "REJECTED"
                    ? "danger"
                    : user.kycStatus === "PENDING"
                      ? "warning"
                      : "outline"
              }
            >
              {user.kycStatus.replace("_", " ")}
            </Badge>
          </div>
          <CardDescription>{kyc.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={kyc.action}
            className="inline-block rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
          >
            {kyc.cta}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Your latest ledger movements</CardDescription>
            </div>
            <Link href="/dashboard/notifications" className="text-sm text-brand">
              {unread > 0 ? `${unread} unread` : "Notifications"}
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-faint">
              No transactions yet. Ledger entries appear here once commissions,
              subscriptions or payouts are recorded against your account.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {entry.description ?? entry.type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-faint">
                      {entry.createdAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        entry.direction === "CREDIT"
                          ? "text-sm font-semibold text-emerald"
                          : "text-sm font-semibold text-foreground"
                      }
                    >
                      {entry.direction === "CREDIT" ? "+" : "−"}
                      {formatCents(entry.amountCents, entry.currency)}
                    </p>
                    <p className="text-xs text-faint">{entry.type}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-faint">
        Wallet top-ups, copy trading, packages and support tickets are not yet
        enabled on this account. {openTickets > 0 && `${openTickets} open ticket(s). `}
        They arrive with the later build phases.
      </p>
    </div>
  );
}
