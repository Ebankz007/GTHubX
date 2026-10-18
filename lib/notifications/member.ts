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
import type { KycAction } from "@/lib/kyc/state";
import { sendEmail } from "./email";
import { writeInAppNotification } from "./in-app";
import {
  kycRejectedTemplate,
  kycVerifiedTemplate,
  registrationPaidTemplate,
} from "./templates";

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
        user: { select: { id: true, email: true, fullName: true } },
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
    await writeInAppNotification({
      userId: payment.user.id,
      type: "PAYMENT",
      title: "Registration confirmed",
      body: `Your registration payment of ${formatCents(payment.amountCents, payment.currency)} was confirmed.`,
      link: "/dashboard/registration",
    });
  } catch (error) {
    console.warn(
      `[notify] registration-paid email failed for payment ${input.paymentId}`,
      error,
    );
  }
}

/**
 * "Your identity is verified" / "verification needs attention."
 *
 * Called once, after the reviewer's decision has committed — so a member is
 * never told their identity passed on a transaction that later rolled back. A
 * rejection carries the reviewer's own words; the reason is passed through
 * unedited and escaped at render time, because an admin's free text is input,
 * not copy.
 */
export async function notifyKycDecision(input: {
  readonly kycProfileId: string;
  readonly action: KycAction;
  readonly reason?: string | null;
}): Promise<void> {
  try {
    const profile = await prisma.kycProfile.findUnique({
      where: { id: input.kycProfileId },
      select: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!profile) return;

    const common = {
      siteName: siteName(),
      name: profile.user.fullName,
      url: `${siteOrigin()}/dashboard/verification`,
    };

    const template =
      input.action === "VERIFY"
        ? kycVerifiedTemplate(common)
        : kycRejectedTemplate({ ...common, reason: input.reason?.trim() || "Not specified" });

    await sendEmail({ to: profile.user.email, ...template });
    if (input.action === "VERIFY") {
      await writeInAppNotification({
        userId: profile.user.id,
        type: "ACCOUNT",
        title: "Identity verified",
        body: "Your identity was verified. Withdrawals are now enabled on your account.",
        link: "/dashboard/verification",
      });
    } else {
      await writeInAppNotification({
        userId: profile.user.id,
        type: "ACCOUNT",
        title: "Verification needs attention",
        body: "A reviewer left a reason — please correct and resubmit.",
        link: "/dashboard/verification",
      });
    }
  } catch (error) {
    console.warn(
      `[notify] kyc ${input.action.toLowerCase()} email failed for profile ${input.kycProfileId}`,
      error,
    );
  }
}
