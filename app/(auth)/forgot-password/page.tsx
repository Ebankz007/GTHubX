import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="card h-72 animate-pulse" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
