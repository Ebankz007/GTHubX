/**
 * Email adapter — Resend, with an honest development fallback.
 *
 * Three behaviours, and the difference between them is the whole point:
 *
 *  - **Configured** → send through Resend. A refusal is reported, not swallowed:
 *    the caller gets `delivered: false` and the reason, so a broken sender
 *    domain shows up in the logs instead of in a member's "no email arrived".
 *  - **Not configured, development** → log the whole message (link included) and
 *    report `dev_logged`. The verification and reset flows stay usable without a
 *    provider account, which is why local development is possible at all.
 *  - **Not configured, production** → report `not_configured` and say so loudly.
 *    **No fake success in production.** A silent "sent" here is how a member ends
 *    up locked out of an account they cannot verify.
 *
 * `sendEmail` never throws: it is called after an account or a payment has
 * already been written, and a mail provider must not be able to undo that.
 */
import { sendViaResend, type OutboundEmail, type ResendConfig } from "./resend";

export type EmailMessage = OutboundEmail;

export type EmailResult = {
  readonly delivered: boolean;
  /** Present when `delivered` is false: `dev_logged`, `not_configured`, `resend_<status>`. */
  readonly reason?: string;
  /** Resend's message id, when the provider accepted it. */
  readonly id?: string;
};

export type { OutboundEmail, ResendConfig };

/** Both halves are required: a key with no verified sender is not configured. */
export function resolveEmailConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function isEmailConfigured(): boolean {
  return resolveEmailConfig() !== null;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = resolveEmailConfig();

  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[email:dev] to=${message.to} subject="${message.subject}"\n${message.text}`,
      );
      return { delivered: false, reason: "dev_logged" };
    }
    console.warn(`[email] Resend is not configured — dropped message to ${message.to}`);
    return { delivered: false, reason: "not_configured" };
  }

  const result = await sendViaResend(config, message);
  if (result.ok) {
    return { delivered: true, id: result.id ?? undefined };
  }

  console.warn(
    `[email] Resend refused the message to ${message.to}: ${result.status} ${result.error}`,
  );
  return { delivered: false, reason: `resend_${result.status || "unreachable"}` };
}
