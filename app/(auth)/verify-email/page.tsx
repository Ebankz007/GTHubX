import { Suspense } from "react";
import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";

export const metadata = { title: "Verify email" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <VerifyEmailPanel />
    </Suspense>
  );
}
