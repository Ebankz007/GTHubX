import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { KycStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KycActions } from "@/components/admin/kyc-actions";
import { documentPolicy } from "@/lib/kyc/policy";

export const metadata = { title: "Identity verification" };

/**
 * The statuses a submission can actually be in.
 *
 * `NOT_STARTED` is absent on purpose: a member who has never submitted has no
 * `KycProfile` row, so a filter for it could never match anything. Offering a
 * control that is permanently empty is a lie about what the queue contains.
 */
const FILTERS = ["ALL", "PENDING", "VERIFIED", "REJECTED"] as const;

function statusVariant(status: string) {
  return status === "VERIFIED"
    ? "success"
    : status === "PENDING"
      ? "warning"
      : status === "REJECTED"
        ? "danger"
        : "outline";
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The review queue: who is waiting, and the controls to decide them.
 *
 * ---------------------------------------------------------------------------
 * Why this list is deliberately thin.
 *
 * Phase 7c rendered every member's legal name, birth date, address and document
 * number straight into this table. Convenient, and wrong: a member's identity
 * details are sensitive personal information, and a list page is a page that
 * gets rendered by scrolling, by prefetching, by an admin who is looking for
 * something else entirely. Access to it was neither necessary nor recorded.
 *
 * So the queue now shows what a reviewer needs to *triage* — who is waiting,
 * how long, what happened last time — and the details live one click away on
 * `/admin/kyc/[id]`, which writes an access record when it is opened. Opening a
 * submission is the moment access to identity data becomes a decision, and a
 * decision is something you can account for.
 * ---------------------------------------------------------------------------
 */
export default async function AdminKycPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("kyc");

  const { status } = await searchParams;
  const active = (FILTERS as readonly string[]).includes(status ?? "")
    ? (status as KycStatus | "ALL")
    : "ALL";

  const [submissions, counts] = await Promise.all([
    prisma.kycProfile.findMany({
      where: active === "ALL" ? undefined : { status: active },
      orderBy: [{ submittedAt: "desc" }],
      take: 50,
      // No identity fields here, by design. See the header.
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        submittedAt: true,
        reviewedAt: true,
        user: { select: { fullName: true, email: true, kycStatus: true } },
      },
    }),
    prisma.kycProfile.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;
  const policy = documentPolicy();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Identity verification
        </h1>
        <p className="mt-1 text-sm text-muted">
          Submissions waiting on a decision. Verifying a member opens
          withdrawals; rejecting one records a reason the member can act on and
          lets them resubmit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Waiting for review</CardDescription>
          <CardTitle className="text-2xl">{countFor("PENDING")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-faint">
            {policy.uploadEnabled
              ? "Document upload is enabled on this deployment."
              : "Document upload is not enabled on this deployment — decisions rest on the details a member typed. Document files are not collected yet."}
          </p>
          <p className="mt-1 text-xs text-faint">
            Opening a submission records the access against your account.
          </p>
        </CardContent>
      </Card>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/admin/kyc" : `/admin/kyc?status=${f}`}
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
          <CardTitle>Submissions</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {submissions.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">
              {active === "ALL"
                ? "No identity submissions yet — they appear when a member submits their details."
                : `No submissions with status ${active}.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Member</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Submitted</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {submissions.map((s) => (
                    <tr key={s.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        {/*
                          A plain anchor, not `next/link`: the App Router
                          prefetches Link targets on hover, and a prefetch would
                          write an access record for a page nobody looked at.
                          An audit trail of imagined views is worse than none.
                        */}
                        <a
                          href={`/admin/kyc/${s.id}`}
                          className="text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-brand"
                        >
                          {s.user.fullName}
                        </a>
                        <p className="text-xs text-faint">{s.user.email}</p>
                        <p className="mt-1 text-xs text-faint">Review details →</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                        {s.reviewedAt ? (
                          <p className="mt-1 text-xs text-faint">
                            reviewed {formatDate(s.reviewedAt)}
                          </p>
                        ) : null}
                        {s.status === "REJECTED" && s.rejectionReason ? (
                          <p className="mt-1 max-w-[18rem] text-xs text-danger">
                            {s.rejectionReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {formatDate(s.submittedAt)}
                      </td>
                      <td className="px-5 py-3">
                        <KycActions id={s.id} status={s.status} />
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
