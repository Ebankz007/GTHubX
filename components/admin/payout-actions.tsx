"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";

/**
 * The three legal moves on one payout, offered strictly by current status —
 * the same matrix `lib/payouts/state.ts` enforces server-side.
 *
 *   REQUESTED -> Approve / Reject
 *   APPROVED  -> Mark paid / Reject   (change of mind is legal before delivery)
 *   PAID      -> nothing: it is terminal, and the money already left the
 *                member's balance at request time.
 *
 * Reject refunds the hold; Approve and Mark paid move no money. The endpoint
 * refuses illegal transitions with 409, so a stale page cannot cause one.
 */
export function PayoutActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const buttons: { action: "APPROVE" | "REJECT" | "MARK_PAID"; label: string; tone: string }[] =
    status === "REQUESTED"
      ? [
          { action: "APPROVE", label: "Approve", tone: "brand" },
          { action: "REJECT", label: "Reject", tone: "danger" },
        ]
      : status === "APPROVED"
        ? [
            { action: "MARK_PAID", label: "Mark paid", tone: "brand" },
            { action: "REJECT", label: "Reject", tone: "danger" },
          ]
        : [];

  if (buttons.length === 0) {
    return <span className="text-xs text-faint">—</span>;
  }

  async function act(action: "APPROVE" | "REJECT" | "MARK_PAID") {
    setBusy(true);
    setError(null);

    const result = await patchJson(`/api/admin/payouts/${id}`, { action });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex gap-1.5">
        {buttons.map((b) => (
          <button
            key={b.action}
            type="button"
            disabled={busy}
            onClick={() => void act(b.action)}
            className={
              b.tone === "danger"
                ? "rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                : "rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
            }
          >
            {busy ? "…" : b.label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="max-w-[18rem] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
