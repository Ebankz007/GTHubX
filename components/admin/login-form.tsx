"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";
import { TextField, FormError } from "@/components/auth/form-field";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await postJson<{ ok: boolean }>("/api/admin/login", {
      email,
      password,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <TextField
        label="Admin email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      <FormError message={error} />

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
