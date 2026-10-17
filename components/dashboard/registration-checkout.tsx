"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";

type Checkout = {
  paymentId: string;
  paymentRef: string;
  amountCents: number;
  status: string;
  paymentUrl: string | null;
  refreshed: boolean;
};

/**
 * Opens (or refreshes) the member's Pay2Crypto checkout.
 *
 * The member supplies nothing but the click: the server owns the amount, the
 * reference and the invoice. A stale link is refreshed server-side rather than
 * shown and apologised for, so the member never has to ask an operator.
 */
export function RegistrationCheckout({
  paymentId,
  hasLink,
}: {
  paymentId: string;
  hasLink: boolean;
}) {
  const router = useRouter();
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function open() {
    setBusy(true);
    setError(null);

    const result = await postJson<{ checkout: Checkout }>(
      `/api/account/payments/${paymentId}/checkout`,
      {},
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setLink(result.data.checkout.paymentUrl);
    if (result.data.checkout.refreshed) {
      // A new invoice replaced the stale one — re-render so the page shows it.
      router.refresh();
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : hasLink ? "Open / refresh checkout" : "Get payment link"}
      </button>

      {link ? (
        <div className="rounded-lg border border-border-strong bg-elevated p-3">
          <p className="text-xs text-faint">
            Pay from your own wallet — Global Traders HubX never holds your keys.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm font-semibold text-brand underline"
            >
              Open Pay2Crypto checkout
            </a>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-background"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 break-all text-xs text-faint">{link}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
