import { DomainError, DomainErrorCode } from "./errors.js";
import { Money } from "./money.js";
import type { PayPeriod } from "./pay-period.js";

export const PayslipLineCategory = {
  /** Ordinary hours and penalty-rate hours for time worked: what the engine independently calculates. */
  HOURS_WORKED: "HOURS_WORKED",
  OVERTIME: "OVERTIME",
  ALLOWANCE: "ALLOWANCE",
  LEAVE: "LEAVE",
  OTHER: "OTHER",
} as const;
export type PayslipLineCategory = (typeof PayslipLineCategory)[keyof typeof PayslipLineCategory];

export interface PayslipLine {
  readonly category: PayslipLineCategory;
  readonly description: string;
  readonly amount: Money;
}

/** Reported pay as printed on the employee's payslip. Gross is before tax and superannuation. */
export interface Payslip {
  readonly payPeriod: PayPeriod;
  readonly grossPay: Money;
  readonly lines: readonly PayslipLine[];
}

export const MAX_PAYSLIP_LINES = 100;
const MAX_DESCRIPTION_LENGTH = 200;

/**
 * Validates a payslip. When itemised lines are supplied they must sum exactly to the gross amount,
 * otherwise the user has made a transcription error that would corrupt the comparison.
 */
export function createPayslip(payslip: Payslip): Payslip {
  if (payslip.grossPay.isNegative()) {
    throw new DomainError(DomainErrorCode.INVALID_PAYSLIP, "Gross pay cannot be negative", "grossPay");
  }
  if (payslip.lines.length > MAX_PAYSLIP_LINES) {
    throw new DomainError(
      DomainErrorCode.INVALID_PAYSLIP,
      `At most ${MAX_PAYSLIP_LINES} lines are accepted`,
      "lines",
    );
  }
  payslip.lines.forEach((line, index) => {
    if (line.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new DomainError(
        DomainErrorCode.INVALID_PAYSLIP,
        `Line description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
        `lines[${index}].description`,
      );
    }
  });
  if (payslip.lines.length > 0) {
    const lineTotal = Money.sum(payslip.lines.map((l) => l.amount));
    if (!lineTotal.equals(payslip.grossPay)) {
      throw new DomainError(
        DomainErrorCode.INVALID_PAYSLIP,
        `Payslip lines total ${lineTotal.toString()} but gross pay is ${payslip.grossPay.toString()}`,
        "lines",
      );
    }
  }
  return Object.freeze({ ...payslip, lines: Object.freeze([...payslip.lines]) });
}

/** Sum of the lines in the given category. */
export function payslipCategoryTotal(payslip: Payslip, category: PayslipLineCategory): Money {
  return Money.sum(payslip.lines.filter((l) => l.category === category).map((l) => l.amount));
}
