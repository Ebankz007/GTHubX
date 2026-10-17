/**
 * Resend transport — the one place GTHubX talks to the mail provider.
 *
 * Split by testability, the same way the payment rail is: `buildResendRequest`
 * is pure and pinned by unit tests (the wire shape is a contract), and
 * `sendViaResend` is the only function that touches the network. It returns a
 * result and never throws — a mail provider having a bad day must not be able
 * to fail a registration or a settlement webhook.
 *
 * Why `fetch` rather than the Resend SDK: this is one POST with a stable body.
 * A dependency would buy types these tests already assert, and cost a lockfile
 * entry plus a supply-chain surface for no gain.
 */

/** The shape every outbound message has, whatever the transport. */
export type OutboundEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
};

export type ResendConfig = {
  readonly apiKey: string;
  /** A verified sender, e.g. `Global Traders HubX <no-reply@example.com>`. */
  readonly from: string;
  /** Override the API host. Used by tests; unset in every real environment. */
  readonly baseUrl?: string;
};

export const RESEND_API_HOST = "https://api.resend.com";

export type ResendRequest = {
  readonly url: string;
  readonly init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  };
};

/**
 * Build the HTTP request for one message. Pure: no env, no clock, no network.
 *
 * `to` is sent as a one-element array because that is the shape Resend accepts
 * for multiple recipients; sending a bare string would work today and stop
 * working the day a template needs a second recipient.
 */
export function buildResendRequest(config: ResendConfig, message: OutboundEmail): ResendRequest {
  const host = (config.baseUrl ?? RESEND_API_HOST).replace(/\/+$/, "");

  const body: Record<string, unknown> = {
    from: config.from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  };
  if (message.html) body.html = message.html;

  return {
    url: `${host}/emails`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
}

export type ResendResult =
  | { readonly ok: true; readonly status: number; readonly id: string | null }
  | { readonly ok: false; readonly status: number; readonly error: string };

/** How long to wait on the provider before giving up. */
export const RESEND_TIMEOUT_MS = 10_000;

/**
 * Send one message. Never throws; every failure mode comes back as a result so
 * the caller can log it and carry on.
 */
export async function sendViaResend(
  config: ResendConfig,
  message: OutboundEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<ResendResult> {
  const request = buildResendRequest(config, message);

  try {
    const response = await fetchImpl(request.url, {
      method: request.init.method,
      headers: request.init.headers,
      body: request.init.body,
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    const raw = await response.text();

    if (!response.ok) {
      // The body carries Resend's own explanation; keep it short but real, so a
      // rejected sender domain is diagnosable from the log alone.
      return { ok: false, status: response.status, error: raw.slice(0, 300) };
    }

    let id: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { id?: unknown };
      id = typeof parsed.id === "string" ? parsed.id : null;
    } catch {
      id = null;
    }

    return { ok: true, status: response.status, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, error: message };
  }
}
