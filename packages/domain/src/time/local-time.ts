import { DomainError, DomainErrorCode } from "../errors.js";
import { LocalDate, pad2 } from "./local-date.js";

const LOCAL_TIME = /^(\d{2}):(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

export const MINUTES_PER_DAY = 1440;

/**
 * Wall-clock time of day at minute precision ("HH:MM"). Payroll inputs are recorded to the minute;
 * seconds are rejected rather than silently truncated.
 *
 * "24:00" is accepted only as an end-of-day marker for rule windows (minuteOfDay = 1440).
 */
export class LocalTime {
  private constructor(readonly minuteOfDay: number) {}

  static parse(value: string, path?: string, options: { allowEndOfDay?: boolean } = {}): LocalTime {
    const match = typeof value === "string" ? LOCAL_TIME.exec(value) : null;
    if (match === null) {
      throw new DomainError(
        DomainErrorCode.INVALID_LOCAL_TIME,
        `Expected HH:MM, got ${JSON.stringify(value)}`,
        path,
      );
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (options.allowEndOfDay === true && hours === 24 && minutes === 0) {
      return new LocalTime(MINUTES_PER_DAY);
    }
    if (hours > 23 || minutes > 59) {
      throw new DomainError(DomainErrorCode.INVALID_LOCAL_TIME, `Time out of range: ${value}`, path);
    }
    return new LocalTime(hours * 60 + minutes);
  }

  static ofMinuteOfDay(minuteOfDay: number): LocalTime {
    if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > MINUTES_PER_DAY) {
      throw new DomainError(DomainErrorCode.INVALID_LOCAL_TIME, `Minute of day out of range: ${minuteOfDay}`);
    }
    return new LocalTime(minuteOfDay);
  }

  get hour(): number {
    return Math.floor(this.minuteOfDay / 60);
  }

  get minute(): number {
    return this.minuteOfDay % 60;
  }

  toString(): string {
    return `${pad2(this.hour)}:${pad2(this.minute)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

/** A date and wall-clock time with no zone ("YYYY-MM-DDTHH:MM"), as written on a timesheet. */
export class LocalDateTime {
  private constructor(
    readonly date: LocalDate,
    readonly time: LocalTime,
  ) {}

  static parse(value: string, path?: string): LocalDateTime {
    const match = typeof value === "string" ? LOCAL_DATE_TIME.exec(value) : null;
    if (match === null) {
      throw new DomainError(
        DomainErrorCode.INVALID_LOCAL_DATE_TIME,
        `Expected YYYY-MM-DDTHH:MM, got ${JSON.stringify(value)}`,
        path,
      );
    }
    return new LocalDateTime(
      LocalDate.parse(match[1] as string, path),
      LocalTime.parse(match[2] as string, path),
    );
  }

  static of(date: LocalDate, time: LocalTime): LocalDateTime {
    return new LocalDateTime(date, time);
  }

  toString(): string {
    return `${this.date.toString()}T${this.time.toString()}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
