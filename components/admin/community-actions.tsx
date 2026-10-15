"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";
import { POST_STATUSES } from "@/lib/validators";
import type { PostStatus } from "@/lib/generated/prisma/enums";

type Entity = "posts" | "comments";

/**
 * Moderation controls for one post or comment.
 *
 * Every state offers exactly the transitions away from itself (restore, hide,
 * remove) — so the controls cannot drift from the enum, and there is no
 * destructive option to confirm. `REMOVED` is reversible like the rest.
 */
export function CommunityActions({
  entity,
  id,
  status,
  isPinned,
}: {
  entity: Entity;
  id: string;
  status: PostStatus;
  isPinned?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    const result = await patchJson(
      `/api/admin/community/${entity}/${id}`,
      patch,
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  const buttonFor = (target: string, label: string, tone: string) => (
    <button
      key={target}
      type="button"
      disabled={busy}
      onClick={() => void save({ status: target })}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${tone}`}
    >
      {busy ? "…" : label}
    </button>
  );

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {POST_STATUSES.filter((s) => s !== status).map((s) => {
          if (s === "PUBLISHED") {
            return buttonFor(
              s,
              "Restore",
              "border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10",
            );
          }
          if (s === "HIDDEN") {
            return buttonFor(
              s,
              "Hide",
              "border-border-strong text-muted hover:bg-elevated",
            );
          }
          return buttonFor(
            s,
            "Remove",
            "border-danger/40 text-danger hover:bg-danger/10",
          );
        })}

        {entity === "posts" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ isPinned: !isPinned })}
            className="rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
          >
            {busy ? "…" : isPinned ? "Unpin" : "Pin"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="max-w-[18rem] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
