/**
 * Email templates — pure functions from facts to a message.
 *
 * No env access, no clock, no database: a caller passes the site name, the link
 * and the amount, and gets back `{subject, text, html}`. That keeps every
 * template unit-testable and keeps money formatting where it belongs
 * (`lib/money`), so a template never does arithmetic on cents.
 *
 * Two rules every template obeys, and the tests enforce:
 *
 *  1. **The link appears in the plain-text part too.** HTML is a courtesy; the
 *     URL is the product. A member whose client strips markup must still be
 *     able to finish the flow.
 *  2. **Anything a member or a request supplied is escaped in the HTML.** A
 *     display name is user input, and an email client is a browser.
 */

export type EmailTemplate = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

/** Escape a value for interpolation into HTML text or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAVY = "#0b1220";
const GOLD = "#d4a72c";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const PAGE = "#f3f5f7";

type LayoutInput = {
  readonly siteName: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly action?: { readonly label: string; readonly url: string };
  readonly footnote?: string;
};

/**
 * The shared shell. Tables and inline styles only — an email client is not a
 * browser, and `<div style="...">` layouts collapse in the ones that matter.
 */
function renderLayout(input: LayoutInput): string {
  const site = escapeHtml(input.siteName);
  const year = new Date().getFullYear();

  const body = input.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">${escapeHtml(text)}</p>`,
    )
    .join("");

  const action = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
         <tr>
           <td style="border-radius:6px;background:${GOLD};">
             <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:${NAVY};text-decoration:none;">${escapeHtml(input.action.label)}</a>
           </td>
         </tr>
       </table>
       <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED};">If the button does not work, copy this link into your browser:</p>
       <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;color:${NAVY};">${escapeHtml(input.action.url)}</p>`
    : "";

  const footnote = input.footnote
    ? `<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(input.footnote)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 24px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">${site}</p>
            <h1 style="margin:0 0 20px;font-size:22px;line-height:30px;color:${NAVY};">${escapeHtml(input.heading)}</h1>
            ${body}
            ${action}
            ${footnote}
            <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:18px;color:${FAINT};">&copy; ${year} ${site}. You are receiving this because you have an account here.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Greeting that degrades gracefully when we do not have a name. */
function greeting(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${trimmed},` : "Hi there,";
}

export type VerifyEmailInput = {
  readonly siteName: string;
  readonly name?: string | null;
  readonly url: string;
  readonly ttlHours: number;
};

export function verifyEmailTemplate(input: VerifyEmailInput): EmailTemplate {
  const hello = greeting(input.name);

  return {
    subject: `Verify your ${input.siteName} email`,
    text: [
      hello,
      "",
      `Welcome to ${input.siteName}. Confirm this email address to activate your account:`,
      "",
      input.url,
      "",
      `This link expires in ${input.ttlHours} hours. If you did not create an account, you can ignore this email.`,
    ].join("\n"),
    html: renderLayout({
      siteName: input.siteName,
      heading: "Confirm your email address",
      paragraphs: [
        hello,
        `Welcome to ${input.siteName}. Confirming this address activates your account and your referral position.`,
      ],
      action: { label: "Verify my email", url: input.url },
      footnote: `This link expires in ${input.ttlHours} hours. If you did not create an account, you can ignore this email.`,
    }),
  };
}

export type PasswordResetInput = {
  readonly siteName: string;
  readonly url: string;
  readonly ttlMinutes: number;
};

export function passwordResetTemplate(input: PasswordResetInput): EmailTemplate {
  return {
    subject: `Reset your ${input.siteName} password`,
    text: [
      `A password reset was requested for your ${input.siteName} account.`,
      "",
      `Choose a new password here (expires in ${input.ttlMinutes} minutes):`,
      "",
      input.url,
      "",
      "If this was not you, ignore this email — your password has not changed.",
    ].join("\n"),
    html: renderLayout({
      siteName: input.siteName,
      heading: "Reset your password",
      paragraphs: [
        `A password reset was requested for your ${input.siteName} account.`,
        `This link expires in ${input.ttlMinutes} minutes.`,
      ],
      action: { label: "Choose a new password", url: input.url },
      footnote: "If this was not you, ignore this email — your password has not changed.",
    }),
  };
}

export type RegistrationPaidInput = {
  readonly siteName: string;
  readonly name?: string | null;
  /**
   * The amount, ALREADY formatted for display (e.g. `USDT 55.00`). Templates do
   * not touch cents; `lib/money` owns that, and the currency is a fact about the
   * payment, not about the email.
   */
  readonly amount: string;
  readonly url: string;
};

export function registrationPaidTemplate(input: RegistrationPaidInput): EmailTemplate {
  const hello = greeting(input.name);

  return {
    subject: `Your ${input.siteName} registration is confirmed`,
    text: [
      hello,
      "",
      `We received your registration fee of ${input.amount}. Your account is active and your referral position is live.`,
      "",
      "You can review the payment and your ledger here:",
      "",
      input.url,
    ].join("\n"),
    html: renderLayout({
      siteName: input.siteName,
      heading: "Your registration is confirmed",
      paragraphs: [
        hello,
        `We received your registration fee of ${input.amount}. Your account is active and your referral position is live.`,
      ],
      action: { label: "View my registration", url: input.url },
    }),
  };
}

export type KycVerifiedInput = {
  readonly siteName: string;
  readonly name?: string | null;
  readonly url: string;
};

/**
 * "Your identity is verified." The one email in this phase a member actually
 * wants: it is the moment the withdrawal gate opens.
 */
export function kycVerifiedTemplate(input: KycVerifiedInput): EmailTemplate {
  const hello = greeting(input.name);

  return {
    subject: `Your ${input.siteName} identity is verified`,
    text: [
      hello,
      "",
      "Your identity has been verified. Withdrawals are now enabled on your account.",
      "",
      "You can review your verification status here:",
      "",
      input.url,
    ].join("\n"),
    html: renderLayout({
      siteName: input.siteName,
      heading: "Identity verified",
      paragraphs: [
        hello,
        "Your identity has been verified. Withdrawals are now enabled on your account.",
      ],
      action: { label: "View my verification", url: input.url },
    }),
  };
}

export type KycRejectedInput = {
  readonly siteName: string;
  readonly name?: string | null;
  /**
   * The reviewer's reason, as typed. It is interpolated through
   * `renderLayout`, which escapes it — an admin's free text lands in a
   * browser, so it is treated as untrusted input, not as trusted copy.
   */
  readonly reason: string;
  readonly url: string;
};

/**
 * "We could not accept your submission." Deliberately not a dead end: the
 * reason is stated, and the same page lets the member correct it and resubmit.
 */
export function kycRejectedTemplate(input: KycRejectedInput): EmailTemplate {
  const hello = greeting(input.name);

  return {
    subject: `Your ${input.siteName} verification needs attention`,
    text: [
      hello,
      "",
      "We could not accept your identity submission.",
      "",
      `Reason given: ${input.reason}`,
      "",
      "You can correct it and submit again here:",
      "",
      input.url,
      "",
      "If you believe this is a mistake, reply to this email or open a support ticket.",
    ].join("\n"),
    html: renderLayout({
      siteName: input.siteName,
      heading: "Verification needs attention",
      paragraphs: [
        hello,
        "We could not accept your identity submission. The reviewer gave this reason:",
        input.reason,
      ],
      action: { label: "Review and resubmit", url: input.url },
      footnote:
        "If you believe this is a mistake, reply to this email or open a support ticket.",
    }),
  };
}
