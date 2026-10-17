/**
 * Pay2Crypto wire contract — the ONLY module that speaks the gateway's format.
 *
 * Everything here is pure: no fetch, no database, no environment. That is
 * deliberate. If Pay2Crypto renames a field, the pinned tests in
 * `tests/payments/pay2crypto.test.ts` are what fails — before a payment row is
 * ever stored with no way to pay, and before a webhook silently stops matching.
 *
 * The shape below is the merchant-integration contract (POST
 * /v1/payment-requests → `checkout_url` + `token`). Field names that are not
 * certain are read defensively AND the alternatives are accepted, so a rename
 * degrades into a loud 502 rather than a quiet mismatch.
 *
 * Strings sent to the gateway stay ASCII: a non-ASCII character in a request
 * body is exactly the trap lessons 196/197 describe, and a description is not
 * worth a mangled invoice.
 */

/** Pay2Crypto requests expire after ~1 hour. */
export const CHECKOUT_FRESH_MINUTES = 50;

/** USDT on TRC20 is the pinned rail; both are overridable by configuration. */
export const DEFAULT_ASSET = "USDT";
export const DEFAULT_NETWORK = "trc20";

/** Only the purposes GTHubX can actually charge for. */
export type GatewayPurpose = "REGISTRATION" | "DEPOSIT";

export type PaymentRequestBody = {
  /** 2-decimal STRING, not a number — pinned from the integration snippet. */
  amount: string;
  asset: string;
  network: string;
  /** Our reference. The gateway echoes this back as `payment_ref`. */
  reference: string;
  description: string;
  return_url: string;
};

export type PaymentGatewayErrorCode =
  | "gateway_not_configured"
  | "gateway_error"
  | "invalid_gateway_response";

/** Gateway failures are operational, not bugs — callers map these to HTTP. */
export class PaymentGatewayError extends Error {
  readonly code: PaymentGatewayErrorCode;

  constructor(code: PaymentGatewayErrorCode, message: string) {
    super(message);
    this.name = "PaymentGatewayError";
    this.code = code;
  }

  get status(): number {
    return this.code === "gateway_not_configured" ? 503 : 502;
  }
}

/** Cents -> the gateway's 2-decimal string. `5500` -> `"55.00"`. */
export function centsToGatewayAmount(amountCents: number): string {
  if (!Number.isInteger(amountCents)) {
    throw new PaymentGatewayError(
      "invalid_gateway_response",
      `Amount must be integer cents, got ${amountCents}`,
    );
  }
  return (amountCents / 100).toFixed(2);
}

/**
 * Build the exact `POST /v1/payment-requests` body. Pure — the whole contract
 * is unit-pinned offline, so a change here is a reviewed change, not a guess.
 */
export function buildPaymentRequestBody(input: {
  readonly paymentRef: string;
  readonly amountCents: number;
  readonly purpose: GatewayPurpose;
  readonly returnUrl: string;
  readonly asset?: string;
  readonly network?: string;
}): PaymentRequestBody {
  const dollars = centsToGatewayAmount(input.amountCents);
  const what =
    input.purpose === "REGISTRATION"
      ? "registration fee"
      : "wallet deposit";
  return {
    amount: dollars,
    asset: input.asset ?? DEFAULT_ASSET,
    network: input.network ?? DEFAULT_NETWORK,
    reference: input.paymentRef,
    description: `Global Traders HubX ${what} - $${dollars}`,
    return_url: input.returnUrl,
  };
}

/**
 * Parse a `POST /v1/payment-requests` success body.
 *
 * The checkout link is `checkout_url` and the gateway-side id is `token`;
 * neighbouring names are accepted so a rename fails loudly HERE rather than
 * storing a row nobody can pay. Throws `invalid_gateway_response` (502).
 */
export function parsePaymentRequestResponse(data: unknown): {
  paymentUrl: string;
  gatewayTxid: string | null;
} {
  const body = (data ?? {}) as Record<string, unknown>;

  const paymentUrl =
    typeof body.checkout_url === "string"
      ? body.checkout_url
      : typeof body.payment_url === "string"
        ? body.payment_url
        : typeof body.url === "string"
          ? body.url
          : null;

  if (body.success === false || !paymentUrl) {
    throw new PaymentGatewayError(
      "invalid_gateway_response",
      "Pay2Crypto returned no checkout link.",
    );
  }

  const gatewayTxid = [body.token, body.txid, body.unique_id, body.id].find(
    (value) => typeof value === "string",
  ) as string | undefined;

  return { paymentUrl, gatewayTxid: gatewayTxid ?? null };
}

/**
 * The statuses that mean the money is in. Anything else (broadcast, pending,
 * confirming) is ACKNOWLEDGED and not applied — the gateway will call again.
 */
const FINAL_STATUSES = ["confirmed", "paid", "success", "completed"] as const;

export function isFinalPaymentStatus(status: unknown): boolean {
  if (typeof status !== "string") return true; // absent status: assume final
  return (FINAL_STATUSES as readonly string[]).includes(status.toLowerCase());
}

export type WebhookPayload = {
  readonly paymentRef: string;
  readonly txHash: string | null;
  readonly status: string | null;
  /** Cents, or null when the gateway did not echo an amount. */
  readonly amountCents: number | null;
  /** The raw value, for error messages. */
  readonly rawAmount: unknown;
};

/**
 * Extract the webhook fields, defensively. `payment_ref` is the join key; a
 * payload without it cannot be matched to anything and is rejected.
 *
 * The amount is parsed generously: the sandbox echoes a STRING ("1"), so a
 * strict number check would silently skip verification altogether — which is
 * the same hole Aglotrends hit and the reason for the numeric-string branch.
 */
export function parseWebhookPayload(payload: unknown): WebhookPayload {
  const body = (payload ?? {}) as Record<string, unknown>;

  const paymentRef =
    typeof body.payment_ref === "string"
      ? body.payment_ref
      : typeof body.reference === "string"
        ? body.reference
        : null;
  if (!paymentRef) {
    throw new PaymentGatewayError(
      "invalid_gateway_response",
      "Webhook payload has no payment reference.",
    );
  }

  const rawAmount = body.payment_amount ?? body.amount;
  const amountCents =
    typeof rawAmount === "number" && Number.isFinite(rawAmount)
      ? Math.round(rawAmount * 100)
      : typeof rawAmount === "string" && rawAmount.trim() !== "" && Number.isFinite(Number(rawAmount))
        ? Math.round(Number(rawAmount) * 100)
        : null;

  return {
    paymentRef,
    txHash: typeof body.tx_hash === "string" ? body.tx_hash : null,
    status: typeof body.status === "string" ? body.status : null,
    amountCents,
    rawAmount,
  };
}

/**
 * Compare an echoed amount against what was charged. Half a cent of tolerance:
 * float noise is ~1e-9, anything at or above this is a real discrepancy.
 * Returns null when the amount matches (or was not echoed).
 */
export function amountMismatchMessage(
  expectedCents: number,
  echoedCents: number | null,
): string | null {
  if (echoedCents === null) return null;
  if (Math.abs(echoedCents - expectedCents) < 1) return null; // < 1 cent = dust
  return `Gateway reports ${(echoedCents / 100).toFixed(2)} but this invoice is ${(expectedCents / 100).toFixed(2)}`;
}
