/**
 * The site's own origin, used to build absolute links in emails and to tell
 * the payment gateway where to send a member back to.
 *
 * It lives here rather than in the email module because payments need it too,
 * and a payment rail should not import the mailer to learn its own address.
 */

export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3500";
}

/**
 * The product's display name, as it should appear to a member.
 *
 * One source for both the site metadata and every email: a member who is told
 * "Verify your X email" and lands on a page branded Y has been handed evidence
 * that the mail is not from us. `app/layout.tsx` reads this too.
 */
export function siteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME ?? "Global Traders HubX";
}
