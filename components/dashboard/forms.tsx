"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";
import {
  TextField,
  TextArea,
  FormError,
  FormNotice,
} from "@/components/auth/form-field";

/** Client-side mirror of `createTicketSchema` — the server re-validates anyway. */
export function SupportForm() {
  const router = useRouter();
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("GENERAL");
  const [priority, setPriority] = React.useState("NORMAL");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await postJson<{ ok: boolean; id: string; message: string }>(
      "/api/support",
      { subject, category, priority, body },
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(`/dashboard/support/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <TextField
        label="Subject"
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="e.g. Withdrawal showing as pending"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="category" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Category</span>
          <select
            id="category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
          >
            <option value="GENERAL">General</option>
            <option value="ACCOUNT">Account</option>
            <option value="PAYMENTS">Payments</option>
            <option value="COPY_TRADING">Copy trading</option>
            <option value="NETWORK">Referral network</option>
            <option value="TECHNICAL">Technical issue</option>
          </select>
        </label>

        <label htmlFor="priority" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Priority</span>
          <select
            id="priority"
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
      </div>

      <TextArea
        label="What happened?"
        name="body"
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Describe the issue, including anything you already tried."
        required
      />

      <FormError message={error} />

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open ticket"}
      </button>
    </form>
  );
}

/**
 * One-shot poster used by the community composer and the ticket reply box —
 * the payloads differ, the plumbing does not.
 */
export function MessageForm({
  endpoint,
  label,
  placeholder,
  submitLabel,
  minHeight,
  redirectTo,
  field = "body",
  extra,
  successMessage = "Posted.",
}: {
  endpoint: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  minHeight?: number;
  redirectTo?: string;
  field?: string;
  extra?: Record<string, string>;
  successMessage?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const payload: Record<string, string> = { [field]: value, ...(extra ?? {}) };
    const result = await postJson<{ ok: boolean; message?: string }>(
      endpoint,
      payload,
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNotice(result.data.message ?? successMessage);
    setValue("");

    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextArea
        label={label}
        name={field}
        rows={minHeight ?? 4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        required
      />
      <FormError message={error} />
      <FormNotice message={notice} />
      <button
        type="submit"
        disabled={busy || value.trim().length === 0}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
