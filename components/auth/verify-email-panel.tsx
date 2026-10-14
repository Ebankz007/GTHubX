"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/auth/form-field";
import { postJson } from "@/lib/http";

type State = "working" | "ok" | "error" | "missing";

export function VerifyEmailPanel() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = React.useState<State>(
    token ? "working" : "missing",
  );
  const [message, setMessage] = React.useState<string | null>(null);

  // Verify once on mount. Guarded so React 19 strict-mode double-invoke does
  // not fire two requests (the token is single-use anyway).
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;

    (async () => {
      const res = await postJson("/api/auth/verify-email", { token });
      if (res.ok) {
        setState("ok");
      } else {
        setMessage(res.error);
        setState("error");
      }
    })();
  }, [token]);

  return (
    <div className="card border-brand-gradient p-7 text-center">
      {state === "working" && (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Verifying…
          </h1>
          <p className="mt-2 text-sm text-muted">
            Confirming your email address.
          </p>
        </>
      )}

      {state === "ok" && (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Email verified
          </h1>
          <div className="mt-4">
            <FormNotice message="Your account is active. You can sign in now." />
          </div>
          <div className="mt-6">
            <ButtonLink href="/login" size="lg" className="w-full">
              Continue to sign in
            </ButtonLink>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Verification failed
          </h1>
          <div className="mt-4">
            <FormError message={message} />
          </div>
          <p className="mt-6 text-sm text-muted">
            <Link href="/login" className="font-medium text-brand hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}

      {state === "missing" && (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Missing link
          </h1>
          <p className="mt-2 text-sm text-muted">
            This page needs a verification token from your email.
          </p>
          <p className="mt-6 text-sm">
            <Link href="/login" className="font-medium text-brand hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
