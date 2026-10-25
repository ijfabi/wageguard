import { DomainError, DomainErrorCode, DomainValidationError, type DomainIssue } from "./errors.js";
import { Interval } from "./time/interval.js";
import type { LocalDateTime } from "./time/local-time.js";
import { Disambiguation, type TimeZone } from "./time/time-zone.js";

export const BreakKind = {
  /** Meal break: unpaid for non-shiftworkers (MA000004 cl. 16.2 Table 3). Deducted from paid time. */
  UNPAID_MEAL: "UNPAID_MEAL",
  /** Rest break: paid (MA000004 cl. 16.2 Table 3). Counted as time worked. */
  PAID_REST: "PAID_REST",
} as const;
export type BreakKind = (typeof BreakKind)[keyof typeof BreakKind];

/** Upper bound on a single recorded shift. Longer records are treated as data-entry errors. */
export const MAX_SHIFT_MINUTES = 24 * 60;

export interface BreakRecord {
  readonly kind: BreakKind;
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
  readonly startUtcOffsetMinutes?: number;
  readonly endUtcOffsetMinutes?: number;
}

/** A shift as entered on a timesheet: wall-clock times in the employment's time zone. */
export interface ShiftRecord {
  readonly id: string;
  readonly start: LocalDateTime;
  readonly end: LocalDateTime;
  /** Only needed when a wall-clock time is ambiguous (repeated hour when daylight saving ends). */
  readonly startUtcOffsetMinutes?: number;
  readonly endUtcOffsetMinutes?: number;
  readonly breaks: readonly BreakRecord[];
}

export interface ResolvedBreak {
  readonly kind: BreakKind;
  readonly interval: Interval;
}

/** A shift placed on the UTC timeline, with every invariant checked. */
export interface ResolvedShift {
  readonly record: ShiftRecord;
  readonly interval: Interval;
  readonly breaks: readonly ResolvedBreak[];
}

/**
 * Resolves wall-clock times to instants and validates the shift:
 * - end strictly after start (zero-length and reversed shifts rejected), at most 24 hours long;
 * - nonexistent or ambiguous wall-clock times (DST transitions) rejected unless an offset is given;
 * - every break lies within the shift and breaks do not overlap one another.
 *
 * All issues are collected and thrown together as a {@link DomainValidationError}.
 */
export function resolveShift(record: ShiftRecord, zone: TimeZone, path = "shift"): ResolvedShift {
  const issues: DomainIssue[] = [];
  const collect = <T>(fn: () => T): T | null => {
    try {
      return fn();
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        issues.push(error.toIssue());
        return null;
      }
      throw error;
    }
  };

  if (record.id.trim() === "") {
    issues.push({ code: DomainErrorCode.INVALID_SHIFT, message: "Shift id is required", path: `${path}.id` });
  }

  const start = collect(() =>
    zone.resolve(record.start, Disambiguation.REJECT, record.startUtcOffsetMinutes, `${path}.start`),
  );
  const end = collect(() =>
    zone.resolve(record.end, Disambiguation.REJECT, record.endUtcOffsetMinutes, `${path}.end`),
  );
  const interval =
    start !== null && end !== null ? collect(() => Interval.of(start, end, `${path}.end`)) : null;

  if (interval !== null && interval.durationMinutes() > MAX_SHIFT_MINUTES) {
    issues.push({
      code: DomainErrorCode.INVALID_SHIFT,
      message: `Shift is ${interval.durationMinutes()} minutes long; the maximum accepted is ${MAX_SHIFT_MINUTES}`,
      path: `${path}.end`,
    });
  }

  const breaks: ResolvedBreak[] = [];
  record.breaks.forEach((brk, index) => {
    const breakPath = `${path}.breaks[${index}]`;
    const breakStart = collect(() =>
      zone.resolve(brk.start, Disambiguation.REJECT, brk.startUtcOffsetMinutes, `${breakPath}.start`),
    );
    const breakEnd = collect(() =>
      zone.resolve(brk.end, Disambiguation.REJECT, brk.endUtcOffsetMinutes, `${breakPath}.end`),
    );
    if (breakStart === null || breakEnd === null) {
      return;
    }
    const breakInterval = collect(() => Interval.of(breakStart, breakEnd, `${breakPath}.end`));
    if (breakInterval === null) {
      return;
    }
    if (interval !== null && !interval.encloses(breakInterval)) {
      issues.push({
        code: DomainErrorCode.INVALID_BREAK,
        message: "Break must fall entirely within the shift",
        path: breakPath,
      });
    }
    const clash = breaks.findIndex((existing) => existing.interval.overlaps(breakInterval));
    if (clash >= 0) {
      issues.push({
        code: DomainErrorCode.INVALID_BREAK,
        message: `Break overlaps break ${clash}`,
        path: breakPath,
      });
    }
    breaks.push({ kind: brk.kind, interval: breakInterval });
  });

  if (issues.length > 0 || interval === null) {
    throw new DomainValidationError(issues);
  }
  return Object.freeze({
    record,
    interval,
    breaks: Object.freeze([...breaks].sort((a, b) => a.interval.start.compare(b.interval.start))),
  });
}

/**
 * Time actually paid: the shift minus unpaid meal breaks. Paid rest breaks remain paid time. When
 * `allBreaksPaid` is set (shiftworkers, MA000004 cl. 26) the whole shift is paid.
 */
export function paidIntervals(shift: ResolvedShift, allBreaksPaid = false): Interval[] {
  if (allBreaksPaid) {
    return [shift.interval];
  }
  const unpaid = shift.breaks.filter((b) => b.kind === BreakKind.UNPAID_MEAL).map((b) => b.interval);
  return shift.interval.subtractAll(unpaid);
}
