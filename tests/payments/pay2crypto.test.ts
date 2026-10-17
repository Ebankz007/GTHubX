import { describe, expect, it } from "vitest";
import { REGISTRATION_GROSS_CENTS } from "@/lib/engine";
import {
  DEFAULT_ASSET,
  DEFAULT_NETWORK,
  PaymentGatewayError,
  amountMismatchMessage,
  buildPaymentRequestBody,
  centsToGatewayAmount,
  isFinalPaymentStatus,
  parsePaymentRequestResponse,
  parseWebhookPayload,
} from "@/lib/payments/pay2crypto";

/**
 * The Pay2Crypto contract, pinned offline.
 *
 * These functions are the ONLY place in GTHubX that speaks the gateway's wire
 * format. If Pay2Crypto renames a field, this file is what fails — before a
 * payment row is stored with no way to pay, and before a webhook quietly stops
 * matching an invoice.
 */

describe("centsToGatewayAmount", () => {
  it("sends the registration gross as a 2-decimal STRING, not a number", () => {
    const amount = centsToGatewayAmount(REGISTRATION_GROSS_CENTS);
    expect(REGISTRATION_GROSS_CENTS).toBe(5500);
    expect(amount).toBe("55.00");
    expect(typeof amount).toBe("string");
  });

  it("pads sub-unit values correctly", () => {
    expect(centsToGatewayAmount(5)).toBe("0.05");
    expect(centsToGatewayAmount(100)).toBe("1.00");
    expect(centsToGatewayAmount(100_000_000)).toBe("1000000.00");
  });

  it("refuses a non-integer cent value rather than rounding money away", () => {
    expect(() => centsToGatewayAmount(55.5)).toThrow(PaymentGatewayError);
  });
});

describe("buildPaymentRequestBody", () => {
  const base = {
    paymentRef: "REG-ABC123",
    amountCents: REGISTRATION_GROSS_CENTS,
    returnUrl: "http://localhost:3500/dashboard/registration",
  } as const;

  it("pins USDT on trc20 by default", () => {
    const body = buildPaymentRequestBody({ ...base, purpose: "REGISTRATION" });
    expect(body.asset).toBe(DEFAULT_ASSET);
    expect(body.asset).toBe("USDT");
    expect(body.network).toBe(DEFAULT_NETWORK);
    expect(body.network).toBe("trc20");
  });

  it("allows the rail to be overridden by configuration", () => {
    const body = buildPaymentRequestBody({
      ...base,
      purpose: "DEPOSIT",
      asset: "USDC",
      network: "erc20",
    });
    expect(body.asset).toBe("USDC");
    expect(body.network).toBe("erc20");
  });

  it("echoes the merchant reference and return URL verbatim", () => {
    const body = buildPaymentRequestBody({ ...base, purpose: "REGISTRATION" });
    expect(body.reference).toBe("REG-ABC123");
    expect(body.return_url).toBe(base.returnUrl);
  });

  it("describes each purpose differently, with the amount in the text", () => {
    const registration = buildPaymentRequestBody({ ...base, purpose: "REGISTRATION" });
    const deposit = buildPaymentRequestBody({ ...base, purpose: "DEPOSIT" });
    expect(registration.description).toContain("registration fee");
    expect(registration.description).toContain("$55.00");
    expect(deposit.description).toContain("deposit");
    expect(deposit.description).not.toBe(registration.description);
  });

  it("keeps the gateway-bound description ASCII", () => {
    // Lessons 196/197: a non-ASCII character in a request body is exactly how
    // an invoice description arrives mangled.
    const body = buildPaymentRequestBody({ ...base, purpose: "REGISTRATION" });
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7E]*$/.test(body.description)).toBe(true);
  });
});

describe("parsePaymentRequestResponse", () => {
  it("reads checkout_url and token — the pinned sandbox shape", () => {
    const parsed = parsePaymentRequestResponse({
      success: true,
      checkout_url: "https://checkout.pay2crypto.com/?txid=abc",
      token: "tok_123",
    });
    expect(parsed.paymentUrl).toBe("https://checkout.pay2crypto.com/?txid=abc");
    expect(parsed.gatewayTxid).toBe("tok_123");
  });

  it("falls back to payment_url and url", () => {
    expect(parsePaymentRequestResponse({ payment_url: "https://a" }).paymentUrl).toBe("https://a");
    expect(parsePaymentRequestResponse({ url: "https://b" }).paymentUrl).toBe("https://b");
  });

  it("falls back to the other gateway id field names", () => {
    expect(parsePaymentRequestResponse({ url: "https://c", txid: "t1" }).gatewayTxid).toBe("t1");
    expect(parsePaymentRequestResponse({ url: "https://c", unique_id: "u1" }).gatewayTxid).toBe("u1");
    expect(parsePaymentRequestResponse({ url: "https://c", id: "i1" }).gatewayTxid).toBe("i1");
    expect(parsePaymentRequestResponse({ url: "https://c" }).gatewayTxid).toBeNull();
  });

  it("fails loudly when there is no checkout link", () => {
    expect(() => parsePaymentRequestResponse({ success: true, token: "x" })).toThrow(
      PaymentGatewayError,
    );
    try {
      parsePaymentRequestResponse({ success: true, token: "x" });
    } catch (error) {
      expect((error as PaymentGatewayError).code).toBe("invalid_gateway_response");
      expect((error as PaymentGatewayError).status).toBe(502);
    }
  });

  it("fails loudly when the gateway reports failure even with a URL present", () => {
    expect(() =>
      parsePaymentRequestResponse({ success: false, checkout_url: "https://d" }),
    ).toThrow(PaymentGatewayError);
  });

  it("handles null, undefined and non-object payloads without a TypeError", () => {
    for (const bad of [null, undefined, "nonsense", 42, []]) {
      expect(() => parsePaymentRequestResponse(bad)).toThrow(PaymentGatewayError);
    }
  });
});

describe("isFinalPaymentStatus", () => {
  it("accepts the final statuses case-insensitively", () => {
    for (const status of ["confirmed", "paid", "success", "completed", "CONFIRMED", "Paid"]) {
      expect(isFinalPaymentStatus(status)).toBe(true);
    }
  });

  it("treats in-flight statuses as not final — the gateway will call again", () => {
    for (const status of ["broadcast", "pending", "confirming", "processing", ""]) {
      expect(isFinalPaymentStatus(status)).toBe(false);
    }
  });

  it("treats an absent status as final", () => {
    expect(isFinalPaymentStatus(undefined)).toBe(true);
    expect(isFinalPaymentStatus(null)).toBe(true);
  });
});

describe("parseWebhookPayload", () => {
  it("reads payment_ref as the join key", () => {
    const parsed = parseWebhookPayload({
      payment_ref: "REG-ABC",
      tx_hash: "0xdeadbeef",
      status: "confirmed",
    });
    expect(parsed.paymentRef).toBe("REG-ABC");
    expect(parsed.txHash).toBe("0xdeadbeef");
    expect(parsed.status).toBe("confirmed");
  });

  it("accepts `reference` when the gateway uses the request-side name", () => {
    expect(parseWebhookPayload({ reference: "REG-XYZ" }).paymentRef).toBe("REG-XYZ");
  });

  it("refuses a payload with no reference at all", () => {
    expect(() => parseWebhookPayload({ status: "confirmed" })).toThrow(PaymentGatewayError);
    expect(() => parseWebhookPayload(null)).toThrow(PaymentGatewayError);
  });

  it("parses a numeric amount into cents", () => {
    expect(parseWebhookPayload({ payment_ref: "R", payment_amount: 55 }).amountCents).toBe(5500);
    expect(parseWebhookPayload({ payment_ref: "R", amount: 0.05 }).amountCents).toBe(5);
  });

  it("parses a numeric STRING amount — the sandbox echoes strings", () => {
    // A type-narrow check here would silently skip verification altogether.
    expect(parseWebhookPayload({ payment_ref: "R", payment_amount: "55" }).amountCents).toBe(5500);
    expect(parseWebhookPayload({ payment_ref: "R", payment_amount: "55.00" }).amountCents).toBe(
      5500,
    );
  });

  it("reports null when the gateway did not echo an amount", () => {
    expect(parseWebhookPayload({ payment_ref: "R" }).amountCents).toBeNull();
    expect(parseWebhookPayload({ payment_ref: "R", payment_amount: "" }).amountCents).toBeNull();
    expect(parseWebhookPayload({ payment_ref: "R", payment_amount: "nonsense" }).amountCents).toBeNull();
  });

  it("keeps the raw amount for the error message", () => {
    expect(parseWebhookPayload({ payment_ref: "R", payment_amount: "1" }).rawAmount).toBe("1");
  });
});

describe("amountMismatchMessage", () => {
  it("passes an exact match", () => {
    expect(amountMismatchMessage(5500, 5500)).toBeNull();
  });

  it("is exact at the one-cent boundary", () => {
    // Amounts are rounded to whole cents before they get here, so the
    // tolerance exists only to absorb float noise — a real one-cent
    // difference is a discrepancy, not dust.
    expect(amountMismatchMessage(5500, 5499)).not.toBeNull();
    expect(amountMismatchMessage(5500, 5501)).not.toBeNull();
  });

  it("passes when the gateway echoed nothing (operator-vouched settlement)", () => {
    expect(amountMismatchMessage(5500, null)).toBeNull();
  });

  it("refuses a real discrepancy and names both numbers", () => {
    const message = amountMismatchMessage(5500, 100);
    expect(message).toContain("1.00");
    expect(message).toContain("55.00");
  });

  it("refuses an overpayment too — an unexpected amount is still unexpected", () => {
    expect(amountMismatchMessage(5500, 6000)).not.toBeNull();
  });
});
