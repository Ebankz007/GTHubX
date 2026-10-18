/**
 * GTHubX — the in-app notification writer (Phase 7e).
 *
 * Until this module existed, every notify site sent an email and nothing else:
 * the `/dashboard/notifications` feed rendered, its empty-state copy promised
 * "account status changes, payouts, support replies", and not one code path in
 * the repository could write a row into it. A feed with no writer is a
 * screenshot of a product feature.
 *
 * One function, one job: append a row the member will see the next time they
 * open their dashboard. It is deliberately *not* the email channel — email is
 * `./email`, and the two are written together at each call site so a single
 * event produces both a durable record (this) and a push (the mail).
 *
 * Failure doctrine, inherited from `./member`: a notification row is a receipt,
 * not a transaction. If this write fails it is logged and swallowed — it must
 * never roll back the settlement, the verification decision, or the password
 * reset that triggered it. The email has the same posture for the same reason.
 *
 * `NotificationSetting` gates the *external* channels (email/whatsapp/telegram).
 * The in-app feed is not gated by it: it is the account's own history, and a
 * member who turns off email has not asked to stop having happened-to-them
 * recorded. WhatsApp/Telegram rows are not written until those channels exist
 * — writing rows for a channel nobody can deliver would be a lie in table form.
 */
import { prisma } from "@/lib/prisma";

export async function writeInAppNotification(input: {
  readonly userId: string;
  /** A `NotificationType` value; typed as string so this module stays import-light. */
  readonly type: "SYSTEM" | "ACCOUNT" | "COMMISSION" | "PAYMENT" | "SECURITY" | "COMMUNITY";
  readonly title: string;
  readonly body?: string | null;
  /** Relative path only (`/dashboard/...`) — the feed prefixes the site origin. */
  readonly link?: string | null;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        channel: "IN_APP",
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
  } catch (error) {
    console.warn(
      `[notify] in-app notification failed for user ${input.userId} (${input.type})`,
      error,
    );
  }
}
