import { DomainError, DomainErrorCode } from "../errors.js";

const MS_PER_MINUTE = 60_000;

/**
 * A point on the UTC timeline, stored as integer epoch milliseconds. Every instant WageGuard
 * creates from user input is minute-aligned, which keeps all duration arithmetic in exact integers.
 */
export class Instant {
  private constructor(readonly epochMs: number) {}

  static ofEpochMs(epochMs: number): Instant {
    if (!Number.isSafeInteger(epochMs)) {
      throw new DomainError(
        DomainErrorCode.INVALID_INTERVAL,
        `Instant must be an integer epoch millisecond: ${epochMs}`,
      );
    }
    return new Instant(epochMs);
  }

  static parse(iso: string): Instant {
    const epochMs = Date.parse(iso);
    if (Number.isNaN(epochMs) || !/(Z|[+-]\d{2}:\d{2})$/.test(iso)) {
      throw new DomainError(
        DomainErrorCode.INVALID_INTERVAL,
        `Expected an ISO-8601 instant with offset, got ${iso}`,
      );
    }
    return new Instant(epochMs);
  }

  plusMinutes(minutes: number): Instant {
    return new Instant(this.epochMs + minutes * MS_PER_MINUTE);
  }

  minutesUntil(other: Instant): number {
    return (other.epochMs - this.epochMs) / MS_PER_MINUTE;
  }

  isMinuteAligned(): boolean {
    return this.epochMs % MS_PER_MINUTE === 0;
  }

  compare(other: Instant): -1 | 0 | 1 {
    return this.epochMs < other.epochMs ? -1 : this.epochMs > other.epochMs ? 1 : 0;
  }

  isBefore(other: Instant): boolean {
    return this.epochMs < other.epochMs;
  }

  isAfter(other: Instant): boolean {
    return this.epochMs > other.epochMs;
  }

  equals(other: Instant): boolean {
    return this.epochMs === other.epochMs;
  }

  toString(): string {
    return new Date(this.epochMs).toISOString();
  }

  toJSON(): string {
    return this.toString();
  }
}
