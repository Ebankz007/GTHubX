"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";

/**
 * Confirm one registration payment.
 *
 * Deliberately a single button with no second step: the endpoint refuses a
 * payment that is not PENDING, and the settlement it triggers is not undoable
 * (real money has been credited to real wallets), so a confirm dialog would be
 * theatre on top of a one-way door.
 */
export function PaymentActions({
  id,
  status,
  purpose,
}: {
  id: string;
  status: string;
  purpose: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (status !== "PENDING" || purpose !== "REGISTRATION") {
    return <span className="text-xs text-faint">—</span>;
  }

  async function confirm() {
    setBusy(true);
    setError(null);

    const result = await patchJson(`/api/admin/payments/${id}`, {});

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void confirm()}
        className="rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
      >
        {busy ? "Settling…" : "Confirm & settle"}
      </button>
      {error ? (
        <p role="alert" className="max-w-[18rem] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
