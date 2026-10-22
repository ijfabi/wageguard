import { Decimal as DecimalJs } from "decimal.js";

import { DomainError, DomainErrorCode } from "./errors.js";

/**
 * Isolated Decimal constructor. We clone rather than configure the global `decimal.js` instance so
 * that no other library in the process can change our precision or rounding behaviour.
 *
 * 50 significant digits is far beyond any payroll magnitude; intermediate results are exact for
 * every multiplication of a 2dp rate by an integer minute count.
 */
export const Decimal = DecimalJs.clone({
  precision: 50,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});
export type Decimal = DecimalJs;

const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

/** Parses a plain decimal string ("125", "27.81"). Rejects numbers, exponents, NaN and Infinity. */
export function parseDecimal(value: string, path?: string): Decimal {
  if (typeof value !== "string" || !DECIMAL_STRING.test(value)) {
    throw new DomainError(
      DomainErrorCode.INVALID_DECIMAL,
      `Expected a plain decimal string, got ${JSON.stringify(value)}`,
      path,
    );
  }
  return new Decimal(value);
}

export const RoundingMode = {
  /** Round to nearest; ties away from zero (0.005 -> 0.01, -0.005 -> -0.01). */
  HALF_UP: "HALF_UP",
  /** Round to nearest; ties to even ("banker's rounding"). */
  HALF_EVEN: "HALF_EVEN",
  /** Truncate towards zero. */
  DOWN: "DOWN",
  /** Away from zero. */
  UP: "UP",
} as const;
export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

const DECIMAL_JS_ROUNDING: Readonly<Record<RoundingMode, DecimalJs.Rounding>> = {
  HALF_UP: DecimalJs.ROUND_HALF_UP,
  HALF_EVEN: DecimalJs.ROUND_HALF_EVEN,
  DOWN: DecimalJs.ROUND_DOWN,
  UP: DecimalJs.ROUND_UP,
};

export function roundDecimal(value: Decimal, decimalPlaces: number, mode: RoundingMode): Decimal {
  return value.toDecimalPlaces(decimalPlaces, DECIMAL_JS_ROUNDING[mode]);
}
