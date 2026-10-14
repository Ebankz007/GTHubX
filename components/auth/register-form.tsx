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

export function RegisterForm() {
  const params = useSearchParams();
  const referral = params.get("ref") ?? "";

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
    const res = await postJson("/api/auth/register", {
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      password,
      phone: String(form.get("phone") ?? ""),
      country: String(form.get("country") ?? ""),
      referralCode: String(form.get("referralCode") ?? ""),
    });
    setPending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    toast.success("Account created.");
    setDone(true);
  }

  if (done) {
    return (
      <div className="card border-brand-gradient p-7 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted">
          We sent a verification link to your inbox. Open it to activate your
          account, then sign in.
        </p>
        <ButtonLinkFallback />
      </div>
    );
  }

  return (
    <div className="card border-brand-gradient p-7">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Join the global trading community.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <TextField
          label="Full name"
          name="fullName"
          autoComplete="name"
          required
          placeholder="Jane Trader"
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          hint="8+ characters with upper, lower, and a number."
        />
        <TextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Repeat your password"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="Optional"
          />
          <TextField
            label="Country"
            name="country"
            autoComplete="country-name"
            placeholder="Optional"
          />
        </div>
        <TextField
          label="Referral code"
          name="referralCode"
          defaultValue={referral}
          placeholder="Optional"
          hint="Enter the code of the member who invited you."
        />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function ButtonLinkFallback() {
  return (
    <div className="mt-6">
      <Link
        href="/login"
        className="text-sm font-medium text-brand hover:underline"
      >
        Go to sign in
      </Link>
    </div>
  );
}
