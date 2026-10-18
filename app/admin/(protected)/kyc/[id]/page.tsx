import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KycActions } from "@/components/admin/kyc-actions";
import { ageInYears, documentPolicy, idTypeLabel } from "@/lib/kyc/policy";
import { idNumberReference } from "@/lib/kyc/identity";

export const metadata = { title: "Verification submission" };

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="w-48 shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One identity submission, in full — and the access record that opening it
 * creates.
 *
 * ---------------------------------------------------------------------------
 * Why this page exists, and why it writes an audit row.
 *
 * Phase 7c showed every member's identity details in the queue list. That made
 * access to sensitive personal information a side effect of *looking at a
 * list*: unrecorded, unavoidable, and impossible to account for afterwards.
 *
 * Moving the details here inverts that. The queue triages; opening a submission
 * is a deliberate act, and it is the act we record (`kyc.view`, with the admin,
 * the submission and the address). The platform can now answer "who looked at
 * this member's identity data, and when" — which is the question the Data
 * Privacy Act's accountability principle actually asks.
 *
 * The audit write is deliberately **not** wrapped in a try/catch. If the trail
 * cannot be written, the page must not render: showing identity data the
 * platform cannot account for is the exact failure this page was built to
 * prevent, and a silent catch would turn an access-control guarantee into a
 * best-effort one. The read above and this write hit the same database, so a
 * failure here means the page is not serving trustworthy data anyway.
 *
 * Note the `KycActions` controls are rendered here too: a reviewer who has just
 * read the details should not have to navigate back to act on them.
 * ---------------------------------------------------------------------------
 */
export default async function AdminKycDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminPermission("kyc");
  const { id } = await params;

  const submission = await prisma.kycProfile.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      legalName: true,
      dateOfBirth: true,
      country: true,
      address: true,
      idType: true,
      idNumberHash: true,
      idNumberLast4: true,
      rejectionReason: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedBy: { select: { name: true, email: true } },
      user: {
        select: {
          fullName: true,
          email: true,
          kycStatus: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!submission) notFound();

  const ip = clientIpFromHeaders(await headers());
  await recordAudit({
    adminId: admin.id,
    action: "kyc.view",
    entity: "KycProfile",
    entityId: submission.id,
    after: { memberUserId: submission.user.email },
    ip,
  });

  const policy = documentPolicy();
  const dob = submission.dateOfBirth;
  const formatOk = submission.idNumberLast4 !== null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/kyc"
          className="text-xs text-muted transition-colors hover:text-foreground"
        >
          ← Identity verification
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {submission.legalName ?? submission.user.fullName}
          </h1>
          <Badge
            variant={
              submission.status === "VERIFIED"
                ? "success"
                : submission.status === "PENDING"
                  ? "warning"
                  : submission.status === "REJECTED"
                    ? "danger"
                    : "outline"
            }
          >
            {submission.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          Submitted {formatDate(submission.submittedAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submitted details</CardTitle>
          <CardDescription>
            These are the details the member typed. Nothing is shared outside the
            platform, and this page is recorded in the audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="text-sm">
            <Row label="Legal name">{submission.legalName ?? "—"}</Row>
            <Row label="Date of birth">
              {dob
                ? `${dob.toISOString().slice(0, 10)} (age ${ageInYears(dob, new Date())})`
                : "—"}
            </Row>
            <Row label="Country">{submission.country ?? "—"}</Row>
            <Row label="Address">
              <span className="whitespace-pre-wrap">{submission.address ?? "—"}</span>
            </Row>
            <Row label="Document type">
              {submission.idType ? idTypeLabel(submission.idType) : "—"}
            </Row>
            <Row label="Document number">
              {idNumberReference(submission.idNumberLast4)}
              <span className="ml-2 text-xs text-faint">
                {formatOk
                  ? "· the platform does not keep the full number"
                  : "· not recorded"}
              </span>
            </Row>
            <Row label="Duplicate check">
              {submission.idNumberHash
                ? "a keyed digest is on file — a second account using this document would be detectable"
                : "no digest on file (no key configured, or a submission from before identity minimisation)"}
            </Row>
          </dl>
        </CardContent>
      </Card>

      {submission.status === "REJECTED" && submission.rejectionReason ? (
        <Card>
          <CardHeader>
            <CardTitle>Previous rejection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-danger">{submission.rejectionReason}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
          <CardDescription>
            {policy.uploadEnabled
              ? "Document upload is enabled on this deployment."
              : "Document files are not collected on this deployment — decide on the details above."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {submission.status === "PENDING" ? (
            <KycActions id={submission.id} status={submission.status} />
          ) : (
            <p className="text-sm text-muted">
              {submission.status === "VERIFIED"
                ? "This member is verified — withdrawals are open on their account."
                : submission.status === "REJECTED"
                  ? "This submission was rejected. The member may correct it and resubmit."
                  : "Nothing has been submitted for a decision."}
            </p>
          )}
          {submission.reviewedAt ? (
            <p className="text-xs text-faint">
              Decided {formatDate(submission.reviewedAt)}
              {submission.reviewedBy
                ? ` by ${submission.reviewedBy.name ?? submission.reviewedBy.email}`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-sm">
            <Row label="Member">
              <a
                href={`/admin/users?q=${encodeURIComponent(submission.user.email)}`}
                className="underline decoration-border-strong underline-offset-4 transition-colors hover:text-brand"
              >
                {submission.user.email}
              </a>
            </Row>
            <Row label="Account status">{submission.user.status}</Row>
            <Row label="Identity status">{submission.user.kycStatus}</Row>
            <Row label="Member since">{formatDate(submission.user.createdAt)}</Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
