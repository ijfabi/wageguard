import { DomainError, DomainErrorCode } from "../errors.js";
import type { Instant } from "./instant.js";

/**
 * A half-open interval [start, end) on the UTC timeline.
 *
 * Convention (tested): the start instant is included and the end instant is excluded. Two
 * intervals that merely touch (a.end == b.start) do not overlap, so back-to-back shifts and a
 * band ending at 18:00 followed by one starting at 18:00 never double-count a minute.
 *
 * Zero-length and reversed intervals are rejected at construction.
 */
export class Interval {
  private constructor(
    readonly start: Instant,
    readonly end: Instant,
  ) {}

  static of(start: Instant, end: Instant, path?: string): Interval {
    if (!end.isAfter(start)) {
      throw new DomainError(
        DomainErrorCode.INVALID_INTERVAL,
        `Interval end (${end.toString()}) must be after start (${start.toString()})`,
        path,
      );
    }
    return new Interval(start, end);
  }

  durationMinutes(): number {
    return this.start.minutesUntil(this.end);
  }

  contains(instant: Instant): boolean {
    return !instant.isBefore(this.start) && instant.isBefore(this.end);
  }

  /** True if `other` lies entirely within this interval. */
  encloses(other: Interval): boolean {
    return !other.start.isBefore(this.start) && !other.end.isAfter(this.end);
  }

  overlaps(other: Interval): boolean {
    return this.start.isBefore(other.end) && other.start.isBefore(this.end);
  }

  intersection(other: Interval): Interval | null {
    const start = this.start.isAfter(other.start) ? this.start : other.start;
    const end = this.end.isBefore(other.end) ? this.end : other.end;
    return end.isAfter(start) ? new Interval(start, end) : null;
  }

  /** This interval minus every interval in `holes`, as sorted, non-overlapping pieces. */
  subtractAll(holes: readonly Interval[]): Interval[] {
    const sorted = [...holes].sort((a, b) => a.start.compare(b.start));
    const pieces: Interval[] = [];
    let cursor = this.start;
    for (const hole of sorted) {
      if (!hole.end.isAfter(cursor) || !hole.start.isBefore(this.end)) {
        continue;
      }
      if (hole.start.isAfter(cursor)) {
        pieces.push(new Interval(cursor, hole.start));
      }
      if (hole.end.isAfter(cursor)) {
        cursor = hole.end;
      }
    }
    if (this.end.isAfter(cursor)) {
      pieces.push(new Interval(cursor, this.end));
    }
    return pieces;
  }

  toJSON(): { start: string; end: string } {
    return { start: this.start.toString(), end: this.end.toString() };
  }
}
