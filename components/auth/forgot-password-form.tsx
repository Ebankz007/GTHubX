"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  TextField,
  FormError,
  FormNotice,
} from "@/components/auth/form-field";
import { postJson } from "@/lib/http";

export function ForgotPasswordForm() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const res = await postJson("/api/auth/forgot-password", {
      email: String(form.get("email") ?? ""),
    });
    setPending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(
      "If an account exists for that email, a reset link has been sent.",
    );
  }

  return (
    <div className="card border-brand-gradient p-7">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Enter your email and we&apos;ll send a reset link.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <FormNotice message={notice} />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
