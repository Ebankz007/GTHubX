"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";

/**
 * Actions on one FLAGGED rank award.
 *
 *   Mark paid — clears it from the RANK pool if the pool covers it now
 *               (the endpoint answers 409 `pool_short` when it does not, so
 *               a short pool is a "come back later", not a failure).
 *   Reject    — closes it without payment; no money ever moved, so there is
 *               nothing to refund.
 *
 * Only FLAGGED Associate awards get buttons: SKUs are physical fulfillment,
 * and PAID / REJECTED / PENDING have no legal transition.
 */
export function RankAwardActions({
  id,
  status,
  kind,
}: {
  id: string;
  status: string;
  kind: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (status !== "FLAGGED" || kind !== "ASSOCIATE") {
    return <span className="text-xs text-faint">—</span>;
  }

  async function act(action: "MARK_PAID" | "REJECT") {
    setBusy(true);
    setError(null);

    const result = await patchJson(`/api/admin/rank-awards/${id}`, { action });

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
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("MARK_PAID")}
          className="rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
        >
          {busy ? "…" : "Mark paid"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("REJECT")}
          className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          {busy ? "…" : "Reject"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-[18rem] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
