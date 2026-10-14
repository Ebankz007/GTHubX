/**
 * GTHubX — money bridge.
 *
 * The database and the compensation engine (`lib/engine`) both speak INTEGER
 * MINOR UNITS (cents). This module is the single place that converts between
 * cents and human/display strings, so no other file does money arithmetic.
 *
 * Rules:
 *  - Never use `Float` for money anywhere.
 *  - Parsing rejects sub-cent precision rather than silently rounding.
 *  - Formatting is display-only; never feed a formatted string back into math.
 */

/** Throw unless `value` is a safe integer number of cents. */
export function assertIntegerCents(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`money: expected an integer number of cents, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`money: cents value ${value} exceeds safe integer range`);
  }
  return value;
}

/**
 * Parse a user-entered amount (e.g. "20", "20.00", "1,250.50") into integer
 * cents. Rejects anything with more than 2 decimal places.
 */
export function parseAmountToCents(input: string | number): number {
  const raw = typeof input === "number" ? String(input) : input.trim().replace(/,/g, "");
  if (raw === "") throw new Error("money: empty amount");

  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    throw new Error(`money: "${input}" is not a valid amount (max 2 decimal places)`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]);
  const frac = match[3] ?? "";
  const cents = Number(frac.padEnd(2, "0") || "0");

  return sign * (whole * 100 + cents);
}

/** Format integer cents as a currency string, e.g. 2000 -> "$20.00". */
export function formatCents(cents: number, currency = "USD"): string {
  assertIntegerCents(cents);
  const symbol = currency === "USD" ? "$" : `${currency} `;
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${symbol}${whole.toLocaleString("en-US")}.${frac}`;
}

/** Format integer cents compactly: whole dollars drop the ".00", e.g. 2000 -> "$20". */
export function formatCentsCompact(cents: number, currency = "USD"): string {
  assertIntegerCents(cents);
  if (cents % 100 === 0) {
    const symbol = currency === "USD" ? "$" : `${currency} `;
    return `${symbol}${(cents / 100).toLocaleString("en-US")}`;
  }
  return formatCents(cents, currency);
}

/** Sum a list of integer-cent amounts, asserting each is an integer. */
export function sumCents(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + assertIntegerCents(amount), 0);
}
