import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KycForm, type KycFormValues } from "@/components/dashboard/kyc-form";
import { documentPolicy, idTypeLabel } from "@/lib/kyc/policy";
import { idNumberReference } from "@/lib/kyc/identity";
import { canSubmit } from "@/lib/kyc/state";

export const metadata = { title: "Verification" };

const copy = {
  NOT_STARTED: {
    badge: "outline" as const,
    title: "Verification not started",
    body: "Identity verification unlocks withdrawals, higher limits and full platform access. You will need a government-issued photo ID and proof of address.",
  },
  PENDING: {
    badge: "warning" as const,
    title: "Verification in review",
    body: "Your details are with our review team. Reviews are normally completed within a few working days.",
  },
  VERIFIED: {
    badge: "success" as const,
    title: "Identity verified",
    body: "Your identity has been confirmed. No further action is needed.",
  },
  REJECTED: {
    badge: "danger" as const,
    title: "Verification needs attention",
    body: "Your submission could not be accepted. This is usually a mismatch between your details and your document. Correct it below and submit again.",
  },
} as const;

/**
 * Identity verification: status, the submission form, and what a member needs
 * to have ready.
 *
 * The status copy and the required-documents list come from
 * `lib/kyc/policy.ts`, so what the member is told and what the reviewer expects
 * are the same fact. When document upload is not enabled on this deployment the
 * page **says so** rather than showing an upload control that cannot work.
 *
 * The document number is deliberately **not** read back into the form. The
 * platform keeps only its last four characters, so on a resubmission the member
 * re-enters it — and the page explains why, because a blank field with no
 * explanation reads as a bug. Telling the member the number is not retained is
 * the same claim the database now makes, stated where they can see it.
 */
export default async function VerificationPage() {
  const user = await requireUser();
  const state = copy[user.kycStatus];
  const policy = documentPolicy();

  const profile = await prisma.kycProfile.findUnique({
    where: { userId: user.id },
    select: {
      legalName: true,
      dateOfBirth: true,
      country: true,
      address: true,
      idType: true,
      idNumberLast4: true,
      rejectionReason: true,
      submittedAt: true,
      reviewedAt: true,
    },
  });

  const submittable = canSubmit(user.kycStatus).allowed;

  const initial: KycFormValues = {
    legalName: profile?.legalName ?? user.fullName ?? "",
    dateOfBirth: profile?.dateOfBirth
      ? profile.dateOfBirth.toISOString().slice(0, 10)
      : "",
    country: profile?.country ?? "",
    address: profile?.address ?? "",
    idType: profile?.idType ?? "PASSPORT",
    // Always blank: we do not have it to prefill, by design.
    idNumber: "",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Verification
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your identity verification status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>{state.title}</CardTitle>
            <Badge variant={state.badge}>{user.kycStatus.replace("_", " ")}</Badge>
          </div>
          <CardDescription>{state.body}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {user.kycStatus === "PENDING" ? (
            <p className="text-sm text-muted">
              We will email you the moment your status changes.
            </p>
          ) : null}
          {user.kycStatus === "VERIFIED" ? (
            <p className="text-sm text-muted">
              Withdrawals are enabled on this account.
            </p>
          ) : null}
          {user.kycStatus === "REJECTED" ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-danger">
                Reviewer&apos;s reason
              </p>
              <p className="mt-1 text-sm text-foreground">
                {profile?.rejectionReason ?? "No reason was recorded."}
              </p>
            </div>
          ) : null}
          {profile?.reviewedAt && user.kycStatus !== "PENDING" ? (
            <p className="text-xs text-faint">
              Reviewed{" "}
              {profile.reviewedAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {submittable ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {user.kycStatus === "REJECTED"
                ? "Correct and resubmit"
                : "Submit your details"}
            </CardTitle>
            <CardDescription>
              Your details are sent to a reviewer. Nothing is shared outside the
              platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile?.idNumberLast4 ? (
              <p className="rounded-xl border border-border bg-elevated px-3.5 py-2.5 text-xs text-muted">
                We keep only the last four characters of the document number you
                gave us ({idNumberReference(profile.idNumberLast4)}), not the
                whole number. Re-enter it below so the reviewer can check it
                against your details again.
              </p>
            ) : null}
            <KycForm initial={initial} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What you will need</CardTitle>
          <CardDescription>
            {policy.uploadEnabled
              ? "Have these ready — the reviewer may ask for them."
              : "Have these ready. A reviewer may ask for them by email; document upload is not enabled on this account yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {policy.documents.map((doc) => (
              <li key={doc.id} className="text-sm">
                <p className="text-foreground">
                  {doc.label}
                  {doc.required ? (
                    <span className="text-faint"> · required</span>
                  ) : (
                    <span className="text-faint"> · sometimes</span>
                  )}
                </p>
                <p className="text-xs text-faint">{doc.hint}</p>
              </li>
            ))}
          </ul>
          {profile?.idType ? (
            <p className="mt-4 text-xs text-faint">
              Presenting: {idTypeLabel(profile.idType)}
              {profile.idNumberLast4
                ? ` · document ${idNumberReference(profile.idNumberLast4)}`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why we verify</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>Protects your account from unauthorised use.</li>
            <li>Required before any withdrawal can be processed.</li>
            <li>Keeps the platform compliant with anti-money-laundering rules.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
