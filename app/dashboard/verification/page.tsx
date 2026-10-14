import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Verification" };

const copy = {
  NOT_STARTED: {
    badge: "outline" as const,
    title: "Verification not started",
    body: "Identity verification unlocks withdrawals, higher limits and full platform access. You will need a government-issued photo ID and proof of address.",
    detail: "Document upload has not been enabled on this account yet.",
  },
  PENDING: {
    badge: "warning" as const,
    title: "Verification in review",
    body: "Your documents are with our review team. Reviews are normally completed within a few working days.",
    detail: "We will notify you the moment your status changes.",
  },
  VERIFIED: {
    badge: "success" as const,
    title: "Identity verified",
    body: "Your identity has been confirmed. No further action is needed.",
    detail: "Full platform access is enabled on this account.",
  },
  REJECTED: {
    badge: "danger" as const,
    title: "Verification needs attention",
    body: "Your submission could not be accepted. This is usually an unreadable document or a mismatch between your details and your ID.",
    detail: "Resubmission has not been enabled on this account yet.",
  },
} as const;

/**
 * Phase 4 delivers status + explanation. The document-upload flow lands with
 * the KYC adapters in Phase 7 — this page says so rather than pretending.
 */
export default async function VerificationPage() {
  const user = await requireUser();
  const state = copy[user.kycStatus];

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
            <Badge variant={state.badge}>
              {user.kycStatus.replace("_", " ")}
            </Badge>
          </div>
          <CardDescription>{state.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">{state.detail}</p>
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
