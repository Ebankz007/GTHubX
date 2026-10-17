/**
 * Gateway transport — configuration resolution and the one function that
 * actually calls Pay2Crypto.
 *
 * Kept apart from `pay2crypto.ts` (the pure contract) so the contract stays
 * testable offline and the network/env concerns stay in one auditable place.
 *
 * Mock mode is a DEVELOPMENT affordance and says so: with no token configured
 * in development the rail returns a synthetic checkout URL so the whole flow
 * is walkable before a merchant account exists. In production an unconfigured
 * rail REFUSES (503) — there is no fake success in production.
 */
import { randomUUID } from "node:crypto";
import {
  PaymentGatewayError,
  buildPaymentRequestBody,
  parsePaymentRequestResponse,
  type GatewayPurpose,
} from "./pay2crypto";

export type GatewayConfig = {
  readonly apiUrl: string;
  readonly token: string;
  readonly webhookSecret: string;
  readonly asset: string;
  readonly network: string;
};

/** Read the rail configuration from the environment. Never logs the token. */
export function resolveGatewayConfig(): GatewayConfig {
  return {
    apiUrl: (process.env.PAY2CRYPTO_API_URL ?? "").trim().replace(/\/+$/, ""),
    token: (process.env.PAY2CRYPTO_TOKEN ?? "").trim(),
    webhookSecret: (process.env.PAY2CRYPTO_WEBHOOK_SECRET ?? "").trim(),
    asset: (process.env.PAY2CRYPTO_ASSET ?? "").trim() || "USDT",
    network: (process.env.PAY2CRYPTO_NETWORK ?? "").trim() || "trc20",
  };
}

export function isGatewayConfigured(config: GatewayConfig): boolean {
  return config.apiUrl !== "" && config.token !== "";
}

/** Development-only: a synthetic checkout so the flow is walkable. */
export function isMockMode(config: GatewayConfig): boolean {
  return !isGatewayConfigured(config) && process.env.NODE_ENV !== "production";
}

export type GatewaySummary = {
  readonly configured: boolean;
  readonly mock: boolean;
  readonly apiUrl: string;
  readonly asset: string;
  readonly network: string;
  readonly webhookSecretSet: boolean;
  readonly tokenSet: boolean;
};

/**
 * What an operator needs to see, with no secret material in it. The token and
 * secret are reported as booleans, never values — state points at secrets, it
 * does not contain them (lesson 208).
 */
export function gatewaySummary(config: GatewayConfig = resolveGatewayConfig()): GatewaySummary {
  return {
    configured: isGatewayConfigured(config),
    mock: isMockMode(config),
    apiUrl: config.apiUrl,
    asset: config.asset,
    network: config.network,
    webhookSecretSet: config.webhookSecret !== "",
    tokenSet: config.token !== "",
  };
}

/**
 * Ask Pay2Crypto for a checkout URL. No database, no ledger — shared by
 * invoice creation and checkout refresh so both speak one contract.
 *
 * @throws PaymentGatewayError — `gateway_not_configured` (503) in production
 *         with no token; `gateway_error` (502) when the gateway refuses.
 */
export async function requestGatewayCheckout(input: {
  readonly paymentRef: string;
  readonly amountCents: number;
  readonly purpose: GatewayPurpose;
  readonly returnUrl: string;
  readonly config?: GatewayConfig;
}): Promise<{ paymentUrl: string; gatewayTxid: string | null }> {
  const config = input.config ?? resolveGatewayConfig();

  if (isMockMode(config)) {
    const gatewayTxid = `mock-${randomUUID()}`;
    return {
      gatewayTxid,
      paymentUrl: `https://checkout.pay2crypto.com/?txid=${gatewayTxid}&mock=1`,
    };
  }

  if (!isGatewayConfigured(config)) {
    throw new PaymentGatewayError(
      "gateway_not_configured",
      "The payment rail is not configured on this deployment (PAY2CRYPTO_API_URL / PAY2CRYPTO_TOKEN).",
    );
  }

  const body = buildPaymentRequestBody({
    paymentRef: input.paymentRef,
    amountCents: input.amountCents,
    purpose: input.purpose,
    returnUrl: input.returnUrl,
    asset: config.asset,
    network: config.network,
  });

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/v1/payment-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new PaymentGatewayError(
      "gateway_error",
      `Pay2Crypto is unreachable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    // The gateway's own message is the actionable part; keep it short.
    const text = await response.text().catch(() => "");
    throw new PaymentGatewayError(
      "gateway_error",
      `Pay2Crypto refused the payment request: ${response.status} ${text.slice(0, 200)}`,
    );
  }

  const parsed = parsePaymentRequestResponse(await response.json().catch(() => null));
  return { paymentUrl: parsed.paymentUrl, gatewayTxid: parsed.gatewayTxid };
}
