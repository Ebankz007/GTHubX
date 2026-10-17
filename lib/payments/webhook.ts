/**
 * Pay2Crypto confirmation webhook — the only place a payment becomes money.
 *
 * Rules, in order, and each one is load-bearing:
 *
 *  1. Non-final statuses are ACKNOWLEDGED, never applied. The gateway calls
 *     again when the transfer confirms.
 *  2. The amount is verified against the invoice when the gateway echoes it.
 *     A mismatch is refused loudly — settling a short payment would credit the
 *     upline out of money that never arrived.
 *  3. PAID is terminal and idempotent. In GTHubX the status flip and every
 *     credit it causes are written in ONE transaction (the 6a spine), so there
 *     is no window where a payment is PAID but unsettled. A re-delivered
 *     webhook is therefore a pure no-op — not a re-attempt.
 *  4. An EXPIRED invoice is still payable. Expiry is a UI state (the checkout
 *     link went stale); if the member paid it anyway, the money arrived and
 *     must be recorded. The row is flipped back to PENDING inside the
 *     transaction, because the 6a spine rightly refuses to settle anything
 *     that is not payable.
 *  5. A registration is settled ONCE per member, ever. Refresh can leave two
 *     live references, and two settled registrations would pay the upline
 *     twice. The second payment is recorded as PAID (the money is real) but
 *     NOT settled, and says so in the response so an operator can refund it.
 */
import { prisma } from "@/lib/prisma";
import { PLATFORM_FEE_CENTS } from "@/lib/engine";
import { creditWallet } from "@/lib/settlement/wallet";
import { settleRegistrationPayment } from "@/lib/settlement/registration";
import {
  PaymentGatewayError,
  amountMismatchMessage,
  isFinalPaymentStatus,
  parseWebhookPayload,
} from "./pay2crypto";

export type WebhookErrorCode =
  | "payload_invalid"
  | "unknown_reference"
  | "amount_mismatch"
  | "payment_failed";

const WEBHOOK_ERROR_STATUS: Record<WebhookErrorCode, number> = {
  payload_invalid: 400,
  unknown_reference: 404,
  amount_mismatch: 400,
  payment_failed: 409,
};

export class WebhookError extends Error {
  readonly code: WebhookErrorCode;

  constructor(code: WebhookErrorCode, message: string) {
    super(message);
    this.name = "WebhookError";
    this.code = code;
  }

  get status(): number {
    return WEBHOOK_ERROR_STATUS[this.code];
  }
}

export type WebhookResult = {
  readonly applied: boolean;
  readonly purpose: string;
  readonly userId: string;
  readonly status: string;
  /** Set when the payment was recorded but deliberately not settled. */
  readonly unsettledReason?: string;
};

export async function handlePay2CryptoWebhook(payload: unknown): Promise<WebhookResult> {
  let parsed;
  try {
    parsed = parseWebhookPayload(payload);
  } catch (error) {
    if (error instanceof PaymentGatewayError) {
      throw new WebhookError("payload_invalid", error.message);
    }
    throw error;
  }

  // (1) Not final yet — acknowledged, nothing applied.
  if (!isFinalPaymentStatus(parsed.status)) {
    return {
      applied: false,
      purpose: "UNKNOWN",
      userId: "",
      status: parsed.status ?? "unknown",
    };
  }

  const payment = await prisma.payment.findUnique({
    where: { paymentRef: parsed.paymentRef },
    select: {
      id: true,
      userId: true,
      purpose: true,
      status: true,
      amountCents: true,
      platformFeeCents: true,
      currency: true,
    },
  });
  if (!payment) {
    throw new WebhookError(
      "unknown_reference",
      `No payment matches reference ${parsed.paymentRef}.`,
    );
  }

  // (3) Already settled — a pure no-op.
  if (payment.status === "PAID") {
    return {
      applied: false,
      purpose: payment.purpose,
      userId: payment.userId,
      status: "PAID",
    };
  }

  if (payment.status === "FAILED") {
    throw new WebhookError("payment_failed", "This invoice is marked failed.");
  }

  // (2) Amount verification.
  const mismatch = amountMismatchMessage(payment.amountCents, parsed.amountCents);
  if (mismatch) {
    throw new WebhookError("amount_mismatch", mismatch);
  }

  if (payment.purpose === "REGISTRATION") {
    return settleRegistration(payment, parsed.txHash);
  }

  if (payment.purpose === "DEPOSIT") {
    return settleDeposit(payment, parsed.txHash);
  }

  throw new WebhookError(
    "payload_invalid",
    `Unsupported payment purpose ${payment.purpose}.`,
  );
}

type LoadedPayment = {
  readonly id: string;
  readonly userId: string;
  readonly purpose: string;
  readonly status: string;
  readonly amountCents: number;
  readonly platformFeeCents: number;
  readonly currency: string;
};

/**
 * (5) A member's registration settles once. If a Registration already exists
 * the money is still recorded — it arrived — but nothing is distributed twice.
 */
async function settleRegistration(
  payment: LoadedPayment,
  txHash: string | null,
): Promise<WebhookResult> {
  const existing = await prisma.registration.findFirst({
    where: { userId: payment.userId },
    select: { id: true },
  });

  if (existing) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt: new Date(), txHash },
    });
    console.warn(
      `[payments] registration ${payment.id} paid but NOT settled — member ${payment.userId} is already registered. Refund owed.`,
    );
    return {
      applied: true,
      purpose: payment.purpose,
      userId: payment.userId,
      status: "PAID",
      unsettledReason: "already_registered",
    };
  }

  await prisma.$transaction(async (tx) => {
    // (4) An expired invoice the member paid anyway is payable again.
    if (payment.status === "EXPIRED") {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PENDING" },
      });
    }

    return settleRegistrationPayment({
      client: tx,
      paymentId: payment.id,
      adminId: null,
      txHash,
    });
  });

  return {
    applied: true,
    purpose: payment.purpose,
    userId: payment.userId,
    status: "PAID",
  };
}

/**
 * Deposits credit the NET only — the platform fee is operator revenue, not the
 * member's money. The fee row and the wallet credit commit with the PAID write.
 *
 * NOTE: no member-facing producer creates a DEPOSIT invoice yet (that arrives
 * with the wallet phase). The rail still handles it, because a webhook that
 * silently ignores a purpose it can be handed is how money goes missing.
 */
async function settleDeposit(
  payment: LoadedPayment,
  txHash: string | null,
): Promise<WebhookResult> {
  const feeCents = payment.platformFeeCents ?? 0;
  const netCents = payment.amountCents - feeCents;

  await prisma.$transaction(async (tx) => {
    if (payment.status === "EXPIRED") {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PENDING" },
      });
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt: new Date(), txHash },
    });

    if (feeCents > 0) {
      await tx.platformFee.create({
        data: {
          userId: payment.userId,
          paymentId: payment.id,
          purpose: "DEPOSIT",
          amountCents: feeCents,
          currency: payment.currency,
          status: "SETTLED",
          settledAt: new Date(),
        },
      });
    }

    if (netCents > 0) {
      await creditWallet(tx, {
        userId: payment.userId,
        amountCents: netCents,
        sourceUserId: null,
        refType: "PAYMENT",
        refId: payment.id,
        idempotencyKey: `deposit:${payment.id}`,
        description: `Crypto deposit (${payment.currency})`,
      });
    }
  });

  return {
    applied: true,
    purpose: payment.purpose,
    userId: payment.userId,
    status: "PAID",
  };
}

/** Re-exported so the route can map a missing configuration to a clear status. */
export { PLATFORM_FEE_CENTS };
