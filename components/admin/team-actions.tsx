"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";
import { ADMIN_ROLES } from "@/lib/validators";

/**
 * Role select + suspend/restore for one admin row.
 *
 * Your own row is rendered read-only here, and the API refuses it again —
 * self-edit is the easiest way to lock yourself out of the platform, so it is
 * blocked at both layers rather than trusted at one.
 */
export function TeamActions({
  adminId,
  isSelf,
  initialRole,
  isActive,
}: {
  adminId: string;
  isSelf: boolean;
  initialRole: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (isSelf) {
    return (
      <span className="whitespace-nowrap text-xs text-faint">
        This is you — read only
      </span>
    );
  }

  async function save(patch: { role?: string; isActive?: boolean }) {
    setBusy(true);
    setError(null);

    const result = await patchJson(`/api/admin/team/${adminId}`, patch);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <label className="flex items-center gap-2 text-xs">
        <span className="sr-only">Role for this admin</span>
        <select
          value={initialRole}
          disabled={busy}
          onChange={(e) => void save({ role: e.target.value })}
          className="h-8 rounded-lg border border-border-strong bg-elevated px-2 text-xs text-foreground disabled:opacity-50"
        >
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={() => void save({ isActive: !isActive })}
        className={
          isActive
            ? "rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            : "rounded-lg border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
        }
      >
        {busy ? "Saving…" : isActive ? "Deactivate" : "Restore"}
      </button>

      {error ? (
        <p role="alert" className="max-w-[16rem] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
