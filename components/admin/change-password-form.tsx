"use client";

import * as React from "react";
import { postJson } from "@/lib/http";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ChangePasswordForm() {
  const [fields, setFields] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await postJson("/api/admin/change-password", {
      currentPassword: fields.currentPassword,
      newPassword: fields.newPassword,
      confirmPassword: fields.confirmPassword,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNotice("Password changed. Use it on your next sign-in.");
    setFields({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Replace your current admin password. Minimum 8 characters, with at
          least one lowercase letter, one uppercase letter, and one number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Current password
            </label>
            <input
              type="password"
              name="currentPassword"
              value={fields.currentPassword}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, currentPassword: e.target.value }))
              }
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              New password
            </label>
            <input
              type="password"
              name="newPassword"
              value={fields.newPassword}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Confirm new password
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={fields.confirmPassword}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">{error}</p>
          ) : null}
          {notice ? <p className="text-sm text-success">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
