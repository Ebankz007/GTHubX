/**
 * Checkout lifecycle — the database side of the payment rail.
 *
 * Two writers, one rule each:
 *
 *   attachCheckoutToPayment  - best effort. Called after the registration
 *                              transaction commits, so a gateway outage can
 *                              never roll back an account. A failure leaves a
 *                              PENDING payment with no URL, which the member
 *                              fixes by asking for a fresh checkout.
 *   refreshRegistrationCheckout - member-facing. Returns the live link, or
 *                              issues a new invoice when the old one has
 *                              expired.
 *
 * **Refresh expires the old row and creates a new one; it never rewrites the
 * reference on an existing row.** The reference is the webhook join key: if it
 * were rewritten, a member who had already paid the old invoice would have
 * their payment arrive against a reference that no longer exists, and the
 * money would be recorded nowhere. A stale row is a UI problem, not a money
 * problem — so the stale row is preserved, marked EXPIRED, and still settles
 * if its payment lands (see `webhook.ts`).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { siteOrigin } from "@/lib/site";
import { requestGatewayCheckout } from "./gateway";
import { CHECKOUT_FRESH_MINUTES, PaymentGatewayError } from "./pay2crypto";

export type CheckoutErrorCode =
  | "payment_not_found"
  | "already_paid"
  | "already_registered"
  | "not_payable";

const CHECKOUT_ERROR_STATUS: Record<CheckoutErrorCode, number> = {
  payment_not_found: 404,
  already_paid: 409,
  already_registered: 409,
  not_payable: 409,
};

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;

  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }

  get status(): number {
    return CHECKOUT_ERROR_STATUS[this.code];
  }
}

/** Where the gateway sends a member back to after paying. */
export function returnUrlFor(purpose: "REGISTRATION" | "DEPOSIT"): string {
  const base = siteOrigin().replace(/\/$/, "");
  return purpose === "REGISTRATION"
    ? `${base}/dashboard/registration`
    : `${base}/dashboard`;
}

/** A fresh, unguessable reference. The gateway echoes it back verbatim. */
export function newPaymentRef(prefix = "REG"): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

/**
 * Attach a checkout URL to an existing PENDING payment.
 *
 * Best effort by design: the caller has already committed the account and the
 * payment row, and a gateway that is down must not undo that. Returns null when
 * the rail is unavailable instead of throwing — the member is not blocked,
 * because the registration page will ask for a checkout on demand.
 */
export async function attachCheckoutToPayment(input: {
  readonly paymentId: string;
  readonly amountCents: number;
  readonly purpose: "REGISTRATION" | "DEPOSIT";
}): Promise<{ paymentUrl: string; gatewayTxid: string | null } | null> {
  try {
    const checkout = await requestGatewayCheckout({
      paymentRef: await currentRefOf(input.paymentId),
      amountCents: input.amountCents,
      purpose: input.purpose,
      returnUrl: returnUrlFor(input.purpose),
    });

    await prisma.payment.update({
      where: { id: input.paymentId },
      data: {
        paymentUrl: checkout.paymentUrl,
        gatewayTxid: checkout.gatewayTxid,
      },
    });

    return checkout;
  } catch (error) {
    if (error instanceof PaymentGatewayError) {
      console.warn(
        `[payments] checkout not attached to ${input.paymentId}: ${error.code} — ${error.message}`,
      );
      return null;
    }
    throw error;
  }
}

async function currentRefOf(paymentId: string): Promise<string> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { paymentRef: true },
  });
  if (!payment) {
    throw new CheckoutError("payment_not_found", "Payment not found.");
  }
  return payment.paymentRef;
}

export type RegistrationCheckout = {
  readonly paymentId: string;
  readonly paymentRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: string;
  readonly paymentUrl: string | null;
  /** True when a brand-new invoice was issued by this call. */
  readonly refreshed: boolean;
};

/**
 * The member's live checkout for their one-time registration fee.
 *
 * - Already settled  -> `already_paid` (nothing to buy).
 * - Fresh link       -> returned as-is.
 * - Stale or missing -> the old row is marked EXPIRED and a new invoice is
 *                       created; the member never sees a dead link.
 */
export async function refreshRegistrationCheckout(
  userId: string,
): Promise<RegistrationCheckout> {
  const registration = await prisma.registration.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (registration) {
    throw new CheckoutError(
      "already_registered",
      "This account is already registered — there is nothing left to pay.",
    );
  }

  const latest = await prisma.payment.findFirst({
    where: { userId, purpose: "REGISTRATION" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      paymentRef: true,
      amountCents: true,
      currency: true,
      status: true,
      paymentUrl: true,
      createdAt: true,
    },
  });

  if (latest?.status === "PAID") {
    throw new CheckoutError("already_paid", "This payment has already been made.");
  }
  if (!latest) {
    throw new CheckoutError(
      "payment_not_found",
      "No registration payment was found on this account.",
    );
  }
  if (latest.status === "FAILED") {
    throw new CheckoutError("not_payable", "This invoice failed and cannot be reopened.");
  }

  const ageMs = Date.now() - latest.createdAt.getTime();
  if (
    latest.status === "PENDING" &&
    latest.paymentUrl &&
    ageMs < CHECKOUT_FRESH_MINUTES * 60_000
  ) {
    return {
      paymentId: latest.id,
      paymentRef: latest.paymentRef,
      amountCents: latest.amountCents,
      currency: latest.currency,
      status: latest.status,
      paymentUrl: latest.paymentUrl,
      refreshed: false,
    };
  }

  // The old link is dead. Preserve the row (its reference may still settle if
  // the member paid it), then issue a fresh invoice.
  const paymentRef = newPaymentRef();
  const checkout = await requestGatewayCheckout({
    paymentRef,
    amountCents: latest.amountCents,
    purpose: "REGISTRATION",
    returnUrl: returnUrlFor("REGISTRATION"),
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: latest.id, status: { in: ["PENDING", "EXPIRED"] } },
      data: { status: "EXPIRED" },
    });

    return tx.payment.create({
      data: {
        userId,
        purpose: "REGISTRATION",
        amountCents: latest.amountCents,
        platformFeeCents: latest.amountCents - 5000 > 0 ? latest.amountCents - 5000 : 0,
        currency: latest.currency,
        status: "PENDING",
        paymentRef,
        paymentUrl: checkout.paymentUrl,
        gatewayTxid: checkout.gatewayTxid,
      },
      select: {
        id: true,
        paymentRef: true,
        amountCents: true,
        currency: true,
        status: true,
      },
    });
  });

  return {
    paymentId: created.id,
    paymentRef: created.paymentRef,
    amountCents: created.amountCents,
    currency: created.currency,
    status: created.status,
    paymentUrl: checkout.paymentUrl,
    refreshed: true,
  };
}

/** The member's own payment history, newest first. */
export async function listMyPayments(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      purpose: true,
      amountCents: true,
      platformFeeCents: true,
      currency: true,
      status: true,
      paymentRef: true,
      paymentUrl: true,
      txHash: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

/** The member's current registration invoice, or null when there is none. */
export async function currentRegistrationPayment(userId: string) {
  return prisma.payment.findFirst({
    where: { userId, purpose: "REGISTRATION" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      platformFeeCents: true,
      currency: true,
      status: true,
      paymentRef: true,
      paymentUrl: true,
      txHash: true,
      paidAt: true,
      createdAt: true,
    },
  });
}
