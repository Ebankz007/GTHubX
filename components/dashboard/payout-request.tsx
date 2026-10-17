"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";
import { parseAmountToCents } from "@/lib/money";

/**
 * Request a payout from the free wallet balance.
 *
 * The amount is typed in dollars and converted to integer cents here — the
 * API and every row downstream only ever see cents (`lib/money.ts` is the
 * single bridge). The request holds the funds immediately (the balance drops
 * on submit, not on approval), which is why the success line tells the
 * member what actually happened.
 */
export function PayoutRequest({ balanceCents }: { balanceCents: number }) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("BANK_TRANSFER");
  const [destination, setDestination] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);

    let amountCents: number;
    try {
      amountCents = parseAmountToCents(amount);
    } catch {
      setBusy(false);
      setError("Enter a valid amount, e.g. 250 or 250.00");
      return;
    }
    if (amountCents <= 0) {
      setBusy(false);
      setError("Enter an amount greater than zero");
      return;
    }

    const result = await postJson<{
      balanceAfterCents: number;
      payout: { status: string };
    }>("/api/account/payouts", {
      amountCents,
      method,
      destination,
      details: details.trim() || undefined,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setAmount("");
    setDetails("");
    setFlash(
      "Request submitted — the amount is on hold while it awaits review. " +
        "Rejecting it returns the funds to your wallet.",
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Amount (USD)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="250.00"
            className="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand"
          />
          <span className="block text-xs text-faint">
            Free balance:{" "}
            {(balanceCents / 100).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Method
          </span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand"
          >
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CRYPTO">Crypto</option>
            <option value="WALLET">Wallet</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">
          Destination
        </span>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Account number, wallet address, or other destination"
          className="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">
          Details <span className="normal-case text-faint/70">(optional)</span>
        </span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          placeholder="Anything the reviewer should know"
          className="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {flash ? (
        <p role="status" className="text-sm text-emerald">
          {flash}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Request payout"}
      </button>
    </form>
  );
}
