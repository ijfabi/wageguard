/**
 * Display helpers for money received from the API as exact decimal strings ("862.15", "-62.15").
 * Arithmetic is done in integer cents with BigInt, never with JavaScript floating point.
 */

const MONEY = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export function isMoneyString(value: string): boolean {
  return MONEY.test(value.trim());
}

/** "1234.5" -> 123450n. Throws on anything that is not a plain decimal amount. */
export function toCents(value: string): bigint {
  const match = MONEY.exec(value.trim());
  if (match === null) {
    throw new Error(`Not a money amount: ${JSON.stringify(value)}`);
  }
  const [, sign, dollars = "0", fraction = ""] = match;
  const cents = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -cents : cents;
}

/** 123450n -> "1234.50" */
export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = String(abs % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Exact sum of money strings; blank entries count as zero. */
export function sumMoney(values: readonly string[]): string {
  return fromCents(values.filter((v) => v.trim() !== "").reduce((total, v) => total + toCents(v), 0n));
}

/** "-1234.5" -> "-$1,234.50" (Australian dollars, thousands separators). */
export function formatAud(value: string): string {
  const cents = toCents(value);
  const negative = cents < 0n;
  const [whole = "0", fraction = "00"] = fromCents(negative ? -cents : cents).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${fraction}`;
}

/** Like formatAud, but shows an explicit sign for differences: "+$1.00", "-$62.15", "$0.00". */
export function formatDifference(value: string): string {
  const cents = toCents(value);
  return cents > 0n ? `+${formatAud(value)}` : formatAud(value);
}
