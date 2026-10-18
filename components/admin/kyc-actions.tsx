"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";

/**
 * Decide one KYC submission.
 *
 *   Verify — the member's details pass; withdrawals open.
 *   Reject — closes the submission with a reason the member can act on. The
 *            reason is required by the API as well as here: a rejection a
 *            member cannot act on is a support ticket, not a decision.
 *
 * Only PENDING submissions get buttons. NOT_STARTED has nothing to decide,
 * VERIFIED is already decided, and REJECTED waits on the member to resubmit —
 * so there is no legal transition to offer for any of them.
 */
export function KycActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  if (status !== "PENDING") {
    return <span className="text-xs text-faint">—</span>;
  }

  async function act(body: { action: "VERIFY" | "REJECT"; reason?: string }) {
    setBusy(true);
    setError(null);

    const result = await patchJson(`/api/admin/kyc/${id}`, body);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setRejecting(false);
    setReason("");
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="flex w-64 flex-col items-start gap-1.5">
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          rows={3}
          placeholder="Why could this not be accepted?"
          className="w-full rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void act({ action: "REJECT", reason })}
            className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            {busy ? "…" : "Confirm rejection"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setError(null);
            }}
            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-elevated disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act({ action: "VERIFY" })}
          className="rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
        >
          {busy ? "…" : "Verify"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRejecting(true)}
          className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-[16rem] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
