import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { REGISTRATION_FEE_CENTS, PLATFORM_FEE_CENTS } from "@/lib/engine";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegistrationCheckout } from "@/components/dashboard/registration-checkout";

export const metadata = { title: "Registration" };

const statusCopy = {
  PENDING: {
    badge: "warning" as const,
    title: "Registration fee outstanding",
    body: "Your one-time registration fee is not paid yet. Your account, wallet and referral position already exist — the upline is credited the moment this payment confirms.",
  },
  EXPIRED: {
    badge: "outline" as const,
    title: "Checkout link expired",
    body: "Your previous checkout link has expired. Request a fresh one below — nothing was charged, so there is nothing to undo.",
  },
  PAID: {
    badge: "success" as const,
    title: "Registration fee paid",
    body: "Your registration is settled and your referral position is active.",
  },
  FAILED: {
    badge: "danger" as const,
    title: "Payment failed",
    body: "This invoice was marked failed. Contact support and an operator will reopen it.",
  },
} as const;

/**
 * The member's registration payment surface.
 *
 * Everything shown is read from the real payment row — the amount is the
 * server's, not a number typed into a page. The rail is crypto-only today, and
 * the page says so rather than offering methods that do not exist.
 */
export default async function RegistrationPage() {
  const user = await requireUser();

  const [payment, registration] = await Promise.all([
    prisma.payment.findFirst({
      where: { userId: user.id, purpose: "REGISTRATION" },
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
      },
    }),
    prisma.registration.findFirst({
      where: { userId: user.id },
      select: { id: true, createdAt: true, feeCents: true },
    }),
  ]);

  const settled = registration !== null;
  const state = settled
    ? statusCopy.PAID
    : payment
      ? statusCopy[payment.status as keyof typeof statusCopy] ?? statusCopy.PENDING
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Registration
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your one-time membership fee and its settlement.
        </p>
      </div>

      {!payment && !settled ? (
        <Card>
          <CardHeader>
            <CardTitle>No registration invoice</CardTitle>
            <CardDescription>
              There is no registration payment recorded on this account. If you
              believe this is wrong, contact support.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className={settled ? "" : "border-warning/40"}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>{state?.title}</CardTitle>
              <Badge variant={state?.badge ?? "outline"}>
                {settled ? "PAID" : (payment?.status ?? "UNKNOWN")}
              </Badge>
            </div>
            <CardDescription>{state?.body}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {payment ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-faint">Amount</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {formatCents(payment.amountCents, payment.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-faint">Reference</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-muted">
                    {payment.paymentRef}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-faint">
                    {payment.paidAt ? "Paid" : "Recorded"}
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    {(payment.paidAt ?? new Date()).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </dd>
                </div>
              </dl>
            ) : null}

            {payment?.txHash ? (
              <p className="break-all text-xs text-faint">
                On-chain transaction: {payment.txHash}
              </p>
            ) : null}

            {!settled && payment && payment.status !== "FAILED" ? (
              <RegistrationCheckout paymentId={payment.id} hasLink={payment.paymentUrl !== null} />
            ) : null}

            {settled ? (
              <p className="text-sm text-muted">
                Settlement distributed{" "}
                {formatCents(registration?.feeCents ?? REGISTRATION_FEE_CENTS)} to the
                compensation plan.{" "}
                <Link href="/dashboard/transactions" className="text-brand">
                  View your ledger →
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How this payment works</CardTitle>
          <CardDescription>
            Read this before you send anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Payment is by <strong className="text-foreground">USDT on the TRC20 network</strong>,
            handled by Pay2Crypto. You pay from your own wallet — GTHubX never
            takes custody of funds and never asks for a private key or seed phrase.
          </p>
          <p>
            The total is{" "}
            <strong className="text-foreground">
              {formatCents(
                REGISTRATION_FEE_CENTS + PLATFORM_FEE_CENTS,
                payment?.currency ?? "USDT",
              )}
            </strong>{" "}
            — a {formatCents(REGISTRATION_FEE_CENTS, payment?.currency ?? "USDT")} membership fee
            plus a {formatCents(PLATFORM_FEE_CENTS, payment?.currency ?? "USDT")} platform
            transaction fee. Commissions are calculated on the membership fee; the
            platform fee is not distributed.
          </p>
          <p>
            Send only USDT on TRC20 to the address shown at checkout. Funds sent on
            another network cannot be recovered.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
