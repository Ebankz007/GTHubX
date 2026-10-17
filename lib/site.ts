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
