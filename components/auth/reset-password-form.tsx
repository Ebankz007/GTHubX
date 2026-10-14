"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TextField,
  FormError,
  FormNotice,
} from "@/components/auth/form-field";
import { postJson } from "@/lib/http";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    const res = await postJson("/api/auth/reset-password", { token, password });
    setPending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    toast.success("Password updated.");
    setDone(true);
  }

  if (!token) {
    return (
      <div className="card border-brand-gradient p-7">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Invalid link
        </h1>
        <p className="mt-2 text-sm text-muted">
          This reset link is missing its token. Request a new one.
        </p>
        <p className="mt-6 text-center text-sm">
          <Link
            href="/forgot-password"
            className="font-medium text-brand hover:underline"
          >
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card border-brand-gradient p-7">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Password updated
        </h1>
        <FormNotice message="Your password has been changed. All other sessions were signed out." />
        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-brand hover:underline"
          >
            Continue to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card border-brand-gradient p-7">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Set a new password for your account.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <TextField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          hint="8+ characters with upper, lower, and a number."
        />
        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Repeat your password"
        />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
