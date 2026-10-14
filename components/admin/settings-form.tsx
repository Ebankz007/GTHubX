"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";
import type { SettingDefinition } from "@/lib/site-settings";

/**
 * One setting, one form. `fields` mode edits known string properties; `json`
 * mode edits the whole value as JSON and refuses to save invalid JSON rather
 * than silently dropping it.
 */
export function SettingForm({
  definition,
  initial,
}: {
  definition: SettingDefinition;
  initial: Record<string, unknown>;
}) {
  const router = useRouter();
  const [fields, setFields] = React.useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of definition.fields ?? []) {
      const v = initial[f.name];
      seed[f.name] = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
    }
    return seed;
  });
  const [json, setJson] = React.useState(() =>
    definition.mode === "json" ? JSON.stringify(initial, null, 2) : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    let value: Record<string, unknown>;

    if (definition.mode === "json") {
      try {
        const parsed: unknown = JSON.parse(json);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        value = parsed as Record<string, unknown>;
      } catch {
        setBusy(false);
        setError("That is not valid JSON. Fix it and try again — nothing was saved.");
        return;
      }
    } else {
      // Start from the live value so we never wipe keys we do not render.
      value = { ...initial };
      for (const f of definition.fields ?? []) {
        value[f.name] = fields[f.name] ?? "";
      }
    }

    const result = await patchJson(`/api/admin/settings/${definition.key}`, {
      value,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNotice("Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {definition.mode === "json" ? (
        <label className="block">
          <span className="text-sm font-medium text-foreground">Value (JSON)</span>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
            rows={8}
            className="mt-1.5 w-full rounded-xl border border-border bg-elevated px-3.5 py-2.5 font-mono text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </label>
      ) : (
        <div className="space-y-4">
          {(definition.fields ?? []).map((f) => (
            <label key={f.name} className="block">
              <span className="text-sm font-medium text-foreground">{f.label}</span>
              {f.multiline ? (
                <textarea
                  value={fields[f.name] ?? ""}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [f.name]: e.target.value }))
                  }
                  rows={5}
                  className="mt-1.5 w-full rounded-xl border border-border bg-elevated px-3.5 py-2.5 text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              ) : (
                <input
                  type="text"
                  value={fields[f.name] ?? ""}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [f.name]: e.target.value }))
                  }
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              )}
            </label>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving…" : `Save ${definition.title.toLowerCase()}`}
      </button>
    </form>
  );
}
