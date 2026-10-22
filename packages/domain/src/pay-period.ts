import { DomainError, DomainErrorCode } from "./errors.js";
import type { LocalDate } from "./time/local-date.js";

/** Longest pay period accepted. Monthly pay is the longest common cycle. */
export const MAX_PAY_PERIOD_DAYS = 31;

/** A pay period expressed as inclusive local dates, matching how payslips present them. */
export class PayPeriod {
  private constructor(
    readonly startDate: LocalDate,
    readonly endDate: LocalDate,
  ) {}

  static of(startDate: LocalDate, endDate: LocalDate): PayPeriod {
    if (endDate.isBefore(startDate)) {
      throw new DomainError(
        DomainErrorCode.INVALID_PAY_PERIOD,
        "Pay period end date is before its start date",
        "payPeriod.endDate",
      );
    }
    if (startDate.daysUntil(endDate) + 1 > MAX_PAY_PERIOD_DAYS) {
      throw new DomainError(
        DomainErrorCode.INVALID_PAY_PERIOD,
        `Pay period exceeds ${MAX_PAY_PERIOD_DAYS} days`,
        "payPeriod.endDate",
      );
    }
    return new PayPeriod(startDate, endDate);
  }

  lengthInDays(): number {
    return this.startDate.daysUntil(this.endDate) + 1;
  }

  containsDate(date: LocalDate): boolean {
    return !date.isBefore(this.startDate) && !date.isAfter(this.endDate);
  }

  /** Every date in the period, in order. */
  dates(): LocalDate[] {
    return Array.from({ length: this.lengthInDays() }, (_, i) => this.startDate.plusDays(i));
  }

  toJSON(): { startDate: string; endDate: string } {
    return { startDate: this.startDate.toString(), endDate: this.endDate.toString() };
  }
}
