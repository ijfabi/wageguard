import { Decimal, roundDecimal, type RoundingMode } from "./decimal.js";
import { DomainError, DomainErrorCode } from "./errors.js";

export type Currency = "AUD";
export const SUPPORTED_CURRENCY: Currency = "AUD";

/** Up to 12 integer digits and at most 2 fractional digits, optional leading minus. */
const MONEY_STRING = /^-?\d{1,12}(\.\d{1,2})?$/;
const CENT_PLACES = 2;

/**
 * An exact AUD amount at cent precision.
 *
 * Invariants:
 * - The amount always has at most 2 decimal places. Anything finer must be rounded explicitly via
 *   {@link Money.fromDecimal} with a named {@link RoundingMode}; there is no implicit rounding.
 * - Construction from JavaScript `number` is rejected at runtime as well as at the type level, so
 *   binary floating-point values cannot leak into monetary state.
 * - Serialises to a fixed 2dp string ("12.30") for lossless JSON round-trips.
 */
export class Money {
  private constructor(
    private readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static of(amount: string, currency: Currency = SUPPORTED_CURRENCY): Money {
    if (typeof amount !== "string") {
      throw new DomainError(
        DomainErrorCode.INVALID_MONEY,
        "Money must be constructed from a decimal string, not a number",
      );
    }
    if (!MONEY_STRING.test(amount)) {
      throw new DomainError(
        DomainErrorCode.INVALID_MONEY,
        `Invalid money amount ${JSON.stringify(amount)}: expected up to 2 decimal places`,
      );
    }
    assertCurrency(currency);
    return new Money(normaliseZero(new Decimal(amount)), currency);
  }

  static zero(currency: Currency = SUPPORTED_CURRENCY): Money {
    return new Money(new Decimal(0), currency);
  }

  /** The only way to turn an arbitrary-precision intermediate into Money: rounding is always explicit. */
  static fromDecimal(value: Decimal, mode: RoundingMode, currency: Currency = SUPPORTED_CURRENCY): Money {
    if (!value.isFinite()) {
      throw new DomainError(
        DomainErrorCode.INVALID_MONEY,
        "Money cannot be constructed from a non-finite value",
      );
    }
    assertCurrency(currency);
    return new Money(normaliseZero(roundDecimal(value, CENT_PLACES, mode)), currency);
  }

  static sum(values: readonly Money[], currency: Currency = SUPPORTED_CURRENCY): Money {
    return values.reduce((total, next) => total.add(next), Money.zero(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(normaliseZero(this.amount.plus(other.amount)), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(normaliseZero(this.amount.minus(other.amount)), this.currency);
  }

  negate(): Money {
    return new Money(normaliseZero(this.amount.negated()), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  /**
   * Exact product with an arbitrary decimal factor. Deliberately returns a Decimal, not Money: the
   * caller must decide when and how to round (see {@link Money.fromDecimal}).
   */
  multiplyExact(factor: Decimal): Decimal {
    return this.amount.times(factor);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    const result = this.amount.comparedTo(other.amount);
    return result < 0 ? -1 : result > 0 ? 1 : 0;
  }

  equals(other: Money): boolean {
    return sameCurrency(this.currency, other.currency) && this.amount.equals(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  toDecimal(): Decimal {
    return this.amount;
  }

  /** Fixed 2dp, e.g. "1234.50". */
  toString(): string {
    // Decimal#toFixed (not Number#toFixed): formats an amount that already has at most 2dp.
    // eslint-disable-next-line no-restricted-properties
    return this.amount.toFixed(CENT_PLACES);
  }

  toJSON(): string {
    return this.toString();
  }

  private assertSameCurrency(other: Money): void {
    if (!sameCurrency(this.currency, other.currency)) {
      throw new DomainError(
        DomainErrorCode.CURRENCY_MISMATCH,
        `Cannot combine ${this.currency} with ${other.currency}`,
      );
    }
  }
}

function assertCurrency(currency: string): asserts currency is Currency {
  if (currency !== SUPPORTED_CURRENCY) {
    throw new DomainError(
      DomainErrorCode.CURRENCY_MISMATCH,
      `Unsupported currency ${currency}; only AUD is supported`,
    );
  }
}

/**
 * Compared as strings so the guard stays meaningful at runtime (JavaScript callers, deserialised
 * data) even though the MVP's Currency type admits only AUD.
 */
function sameCurrency(a: string, b: string): boolean {
  return a === b;
}

/** decimal.js distinguishes -0 from 0; money must not. */
function normaliseZero(value: Decimal): Decimal {
  return value.isZero() ? new Decimal(0) : value;
}
