/**
 * Member notifications that are triggered by something the member did not
 * directly ask for — currently: a payment confirmed by the gateway.
 *
 * These run **after** money has already moved, so they are best effort by
 * design. Every function here swallows its own failures and logs them: a mail
 * provider must never be able to roll back a settlement, and it must never turn
 * a webhook the gateway will retry into a 500.
 *
 * The amount is formatted by `lib/money` from the payment row, never from the
 * gateway payload — the member is told what we recorded, not what was claimed.
 */
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { siteName, siteOrigin } from "@/lib/site";
import { sendEmail } from "./email";
import { registrationPaidTemplate } from "./templates";

/**
 * "Your registration is confirmed." Called once, after the settlement
 * transaction commits, so the member is never told about a payment that later
 * rolled back.
 */
export async function notifyRegistrationPaid(input: {
  readonly paymentId: string;
}): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: {
        amountCents: true,
        currency: true,
        user: { select: { email: true, fullName: true } },
      },
    });
    if (!payment) return;

    const template = registrationPaidTemplate({
      siteName: siteName(),
      name: payment.user.fullName,
      amount: formatCents(payment.amountCents, payment.currency),
      url: `${siteOrigin()}/dashboard/registration`,
    });

    await sendEmail({ to: payment.user.email, ...template });
  } catch (error) {
    console.warn(
      `[notify] registration-paid email failed for payment ${input.paymentId}`,
      error,
    );
  }
}
