import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { KycStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KycActions } from "@/components/admin/kyc-actions";
import { ageInYears, documentPolicy, idTypeLabel } from "@/lib/kyc/policy";

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
 * Identity submissions, newest first.
 *
 * The reviewer sees everything they need to decide — the legal name, the date of
 * birth and the document number are the whole point of the queue, so they are
 * shown in full rather than masked. `documentPolicy()` states plainly that
 * document files are not collected on this deployment, so a reviewer is never
 * left wondering whether a missing attachment is a bug.
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
      select: {
        id: true,
        status: true,
        legalName: true,
        dateOfBirth: true,
        country: true,
        address: true,
        idType: true,
        idNumber: true,
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
              : "Document upload is not enabled on this deployment — decisions rest on the details below. Document files are not collected yet."}
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
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Submitted details</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Submitted</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {submissions.map((s) => (
                    <tr key={s.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        <p className="text-foreground">{s.user.fullName}</p>
                        <p className="text-xs text-faint">{s.user.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-foreground">{s.legalName ?? "—"}</p>
                        <p className="text-xs text-faint">
                          {s.country ?? "—"}
                          {s.dateOfBirth
                            ? ` · born ${s.dateOfBirth.toISOString().slice(0, 10)} (${ageInYears(s.dateOfBirth, new Date())})`
                            : ""}
                        </p>
                        <p className="text-xs text-faint">
                          {idTypeLabel(s.idType)} · {s.idNumber ?? "—"}
                        </p>
                        {s.address ? (
                          <p className="mt-1 max-w-[22rem] text-xs text-faint">
                            {s.address}
                          </p>
                        ) : null}
                        {s.status === "REJECTED" && s.rejectionReason ? (
                          <p className="mt-1 max-w-[22rem] text-xs text-danger">
                            Rejected: {s.rejectionReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                        {s.reviewedAt ? (
                          <p className="mt-1 text-xs text-faint">
                            reviewed {formatDate(s.reviewedAt)}
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
