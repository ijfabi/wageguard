import { DomainError, DomainErrorCode } from "../errors.js";

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * A calendar date with no time zone (ISO-8601 "YYYY-MM-DD"). Arithmetic is done on a proleptic
 * Gregorian day number, so it is independent of any time zone or DST rule.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  static parse(value: string, path?: string): LocalDate {
    const match = typeof value === "string" ? LOCAL_DATE.exec(value) : null;
    if (match === null) {
      throw new DomainError(
        DomainErrorCode.INVALID_LOCAL_DATE,
        `Expected YYYY-MM-DD, got ${JSON.stringify(value)}`,
        path,
      );
    }
    const [, y, m, d] = match;
    return LocalDate.of(Number(y), Number(m), Number(d), path);
  }

  static of(year: number, month: number, day: number, path?: string): LocalDate {
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 9999 ||
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new DomainError(
        DomainErrorCode.INVALID_LOCAL_DATE,
        `Not a valid calendar date: ${year}-${month}-${day}`,
        path,
      );
    }
    return new LocalDate(year, month, day);
  }

  /** Days since 1970-01-01 in the proleptic Gregorian calendar. */
  toEpochDay(): number {
    return Date.UTC(this.year, this.month - 1, this.day) / MS_PER_DAY;
  }

  static fromEpochDay(epochDay: number): LocalDate {
    const date = new Date(epochDay * MS_PER_DAY);
    return new LocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  plusDays(days: number): LocalDate {
    return LocalDate.fromEpochDay(this.toEpochDay() + days);
  }

  daysUntil(other: LocalDate): number {
    return other.toEpochDay() - this.toEpochDay();
  }

  weekday(): Weekday {
    // 1970-01-01 was a Thursday (index 3 in WEEKDAYS).
    const index = (((this.toEpochDay() + 3) % 7) + 7) % 7;
    return WEEKDAYS[index] as Weekday;
  }

  compare(other: LocalDate): -1 | 0 | 1 {
    const diff = this.toEpochDay() - other.toEpochDay();
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }

  equals(other: LocalDate): boolean {
    return this.compare(other) === 0;
  }

  isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: LocalDate): boolean {
    return this.compare(other) > 0;
  }

  toString(): string {
    return `${String(this.year).padStart(4, "0")}-${pad2(this.month)}-${pad2(this.day)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
