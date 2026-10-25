import type { AwardRuleSet, OvertimeRule, RateRule } from "@wageguard/award-rules";
import {
  EmploymentType,
  Interval,
  WEEKDAYS,
  type EmploymentTerms,
  type LocalDate,
  type ResolvedShift,
  type Weekday,
} from "@wageguard/domain";

import type { OvertimeReason } from "./result.js";
import type { Classification, Segment } from "./segmentation.js";

/** A run of paid time with everything needed to price it. Split freely; never merged across shifts. */
export interface Piece {
  readonly shiftId: string;
  /** Context shifts (before the pay period) count towards limits but are never priced. */
  readonly context: boolean;
  readonly interval: Interval;
  readonly localDate: LocalDate;
  readonly weekday: Weekday;
  readonly classification: Classification;
  readonly publicHoliday: boolean;
  readonly overtime: OvertimeReason | null;
  /** Overtime minutes already worked earlier on the same local date (for the Table 11 tiers). */
  readonly overtimeOffset: number;
  /** Worked before the required break between work days (cl. 16.6(b)). */
  readonly breakDeficit: boolean;
}

export const minutesOf = (piece: Piece): number => piece.interval.durationMinutes();

export function piecesFor(shiftId: string, segments: readonly Segment[], context: boolean): Piece[] {
  return segments.map((segment) => ({
    shiftId,
    context,
    interval: segment.interval,
    localDate: segment.localDate,
    weekday: segment.weekday,
    classification: segment.classification,
    publicHoliday: segment.publicHoliday,
    overtime: null,
    overtimeOffset: 0,
    breakDeficit: false,
  }));
}

/** The Monday that starts the week containing `date` (weeks run Monday to Sunday). */
export const weekKey = (date: LocalDate, weekday: Weekday): string =>
  date.plusDays(-WEEKDAYS.indexOf(weekday)).toString();

const isOrdinary = (piece: Piece): boolean => piece.overtime === null;

/**
 * Marks the last `minutes` of the eligible pieces (in chronological order) with `apply`, splitting
 * the piece that straddles the boundary. Returns a new array in the same order.
 */
function markLastMinutes(
  pieces: readonly Piece[],
  eligible: (piece: Piece) => boolean,
  minutes: number,
  apply: (piece: Piece) => Piece,
): Piece[] {
  const out: Piece[] = [];
  let remaining = minutes;
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const piece = pieces[i] as Piece;
    if (remaining <= 0 || !eligible(piece)) {
      out.push(piece);
      continue;
    }
    const length = minutesOf(piece);
    if (length <= remaining) {
      out.push(apply(piece));
      remaining -= length;
      continue;
    }
    const cut = piece.interval.end.plusMinutes(-remaining);
    out.push(apply({ ...piece, interval: Interval.of(cut, piece.interval.end) }));
    out.push({ ...piece, interval: Interval.of(piece.interval.start, cut) });
    remaining = 0;
  }
  return out.reverse();
}

const asOvertime =
  (reason: OvertimeReason) =>
  (piece: Piece): Piece => ({ ...piece, overtime: reason });

export interface OvertimeOptions {
  readonly ruleSet: AwardRuleSet;
  readonly employment: EmploymentTerms;
  readonly guaranteedHoursVariations: ReadonlyMap<string, number>;
}

export interface OvertimeOutcome {
  readonly pieces: Piece[];
  /** Weeks whose hours exceed 38 under an averaging roster: not overtime on a weekly basis. */
  readonly averagingWeeks: readonly {
    readonly monday: string;
    readonly minutes: number;
    readonly shiftIds: readonly string[];
  }[];
}

/**
 * Decides which paid minutes are overtime (Table 10), in this order:
 * 1. outside the span of ordinary hours (not for shiftwork, whose pieces are never OUTSIDE_SPAN);
 * 2. daily: part-time beyond the day's guaranteed hours (cl. 10.8, varied by cl. 10.6); others beyond
 *    9 ordinary hours, or 11 on the longest day of the week (cl. 15.4, 15.5);
 * 3. weekly, casual and full-time: beyond 38 ordinary hours in the week (unless an averaging roster
 *    applies, which is flagged instead).
 * Each limit takes the last minutes worked, so earlier hours stay ordinary.
 */
export function markOvertime(input: readonly Piece[], options: OvertimeOptions): OvertimeOutcome {
  const { ruleSet, employment } = options;
  const constraints = ruleSet.constraints;
  let pieces: Piece[] = input.map((p) =>
    p.classification.kind === "OUTSIDE_SPAN" ? { ...p, overtime: "SPAN" } : p,
  );

  const ordinaryByDate = () => {
    const byDate = new Map<string, { date: LocalDate; weekday: Weekday; minutes: number }>();
    for (const piece of pieces) {
      if (!isOrdinary(piece)) {
        continue;
      }
      const key = piece.localDate.toString();
      const entry = byDate.get(key) ?? { date: piece.localDate, weekday: piece.weekday, minutes: 0 };
      entry.minutes += minutesOf(piece);
      byDate.set(key, entry);
    }
    return byDate;
  };

  if (employment.employmentType === EmploymentType.PART_TIME) {
    const guaranteed = employment.partTimeGuaranteedMinutes ?? new Map<Weekday, number>();
    for (const [key, day] of ordinaryByDate()) {
      const limit = options.guaranteedHoursVariations.get(key) ?? guaranteed.get(day.weekday) ?? 0;
      if (day.minutes > limit) {
        pieces = markLastMinutes(
          pieces,
          (p) => isOrdinary(p) && p.localDate.toString() === key,
          day.minutes - limit,
          asOvertime("GUARANTEED"),
        );
      }
    }
  } else {
    const byWeek = new Map<string, { key: string; minutes: number }[]>();
    for (const [key, day] of ordinaryByDate()) {
      const week = weekKey(day.date, day.weekday);
      byWeek.set(week, [...(byWeek.get(week) ?? []), { key, minutes: day.minutes }]);
    }
    for (const days of byWeek.values()) {
      // The longest day of the week may run to 11 ordinary hours (cl. 15.5); ties go to the earliest.
      const longest = [...days].sort((a, b) => b.minutes - a.minutes || (a.key < b.key ? -1 : 1))[0];
      for (const day of days) {
        const limit =
          day === longest && constraints.maxOrdinaryOneDayPerWeek !== undefined
            ? constraints.maxOrdinaryOneDayPerWeek.minutes
            : constraints.maxOrdinaryPerDay.minutes;
        if (day.minutes > limit) {
          pieces = markLastMinutes(
            pieces,
            (p) => isOrdinary(p) && p.localDate.toString() === day.key,
            day.minutes - limit,
            asOvertime("DAILY"),
          );
        }
      }
    }
  }

  const averagingWeeks: { monday: string; minutes: number; shiftIds: string[] }[] = [];
  const weeklyLimit =
    employment.employmentType === EmploymentType.CASUAL
      ? constraints.casualWeeklyOrdinary.minutes
      : employment.employmentType === EmploymentType.FULL_TIME
        ? constraints.fullTimeWeeklyOrdinary?.minutes
        : undefined;
  if (weeklyLimit !== undefined) {
    const byWeek = new Map<string, { minutes: number; shiftIds: Set<string> }>();
    for (const piece of pieces) {
      if (!isOrdinary(piece)) {
        continue;
      }
      const key = weekKey(piece.localDate, piece.weekday);
      const entry = byWeek.get(key) ?? { minutes: 0, shiftIds: new Set<string>() };
      entry.minutes += minutesOf(piece);
      if (!piece.context) {
        entry.shiftIds.add(piece.shiftId);
      }
      byWeek.set(key, entry);
    }
    for (const [monday, week] of [...byWeek].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (week.minutes <= weeklyLimit) {
        continue;
      }
      if (employment.averagingRoster) {
        averagingWeeks.push({ monday, minutes: week.minutes, shiftIds: [...week.shiftIds].sort() });
        continue;
      }
      pieces = markLastMinutes(
        pieces,
        (p) => isOrdinary(p) && weekKey(p.localDate, p.weekday) === monday,
        week.minutes - weeklyLimit,
        asOvertime("WEEKLY"),
      );
    }
  }
  return {
    pieces: withOvertimeOffsets(pieces, constraints.overtimeFirstTier?.minutes ?? null),
    averagingWeeks,
  };
}

/**
 * Records, on each overtime piece, how many overtime minutes came before it that day, splitting the
 * piece that crosses the first-tier boundary so each piece sits wholly in one Table 11 tier.
 */
function withOvertimeOffsets(pieces: readonly Piece[], firstTier: number | null): Piece[] {
  const out: Piece[] = [];
  const workedByDate = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.overtime === null) {
      out.push(piece);
      continue;
    }
    const key = piece.localDate.toString();
    const before = workedByDate.get(key) ?? 0;
    const length = minutesOf(piece);
    if (firstTier !== null && before < firstTier && before + length > firstTier) {
      const cut = piece.interval.start.plusMinutes(firstTier - before);
      out.push({ ...piece, interval: Interval.of(piece.interval.start, cut), overtimeOffset: before });
      out.push({ ...piece, interval: Interval.of(cut, piece.interval.end), overtimeOffset: firstTier });
    } else {
      out.push({ ...piece, overtimeOffset: before });
    }
    workedByDate.set(key, before + length);
  }
  return out;
}

/** The Table 11 rule for an overtime piece: public holiday, Sunday, or the Monday-Saturday tier. */
export function overtimeRuleFor(piece: Piece, rules: readonly OvertimeRule[]): OvertimeRule | null {
  if (piece.publicHoliday) {
    return rules.find((r) => r.when.publicHoliday === true) ?? null;
  }
  return (
    rules.find(
      (r) =>
        r.when.days?.includes(piece.weekday) === true &&
        piece.overtimeOffset >= (r.when.fromOvertimeMinute ?? 0) &&
        piece.overtimeOffset < (r.when.untilOvertimeMinute ?? Number.POSITIVE_INFINITY),
    ) ?? null
  );
}

/** Enabled overtime rules for this employment (none in rule sets that do not price overtime). */
export function applicableOvertimeRules(
  rules: readonly RateRule[],
  employment: EmploymentTerms,
): OvertimeRule[] {
  return rules.filter(
    (rule): rule is OvertimeRule =>
      rule.status === "ENABLED" &&
      rule.when.kind === "OVERTIME" &&
      rule.appliesTo.classifications.includes(employment.classificationCode) &&
      rule.appliesTo.employmentTypes.includes(employment.employmentType),
  );
}

/**
 * cl. 16.6: after finishing work on one day, starting again on a later day without the required
 * break puts every shift into deficit until a long enough break is taken.
 */
export function breakDeficitShiftIds(sorted: readonly ResolvedShift[], requiredMinutes: number): Set<string> {
  const ids = new Set<string>();
  let deficit = false;
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1] as ResolvedShift;
    const current = sorted[i] as ResolvedShift;
    const gap = previous.interval.end.minutesUntil(current.interval.start);
    if (gap >= requiredMinutes) {
      deficit = false;
    } else if (!current.record.start.date.equals(previous.record.start.date)) {
      deficit = true;
    }
    if (deficit) {
      ids.add(current.record.id);
    }
  }
  return ids;
}
