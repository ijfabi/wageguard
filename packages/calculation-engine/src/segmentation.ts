import {
  Disambiguation,
  Instant,
  Interval,
  LocalDateTime,
  LocalTime,
  paidIntervals,
  type EmploymentTerms,
  type LocalDate,
  type ResolvedShift,
  type TimeZone,
  type Weekday,
} from "@wageguard/domain";
import type { AwardRuleSet, RateRule, ShiftworkRule, WeeklyWindowRule } from "@wageguard/award-rules";

import type { ParsedPublicHoliday } from "./input.js";

/** What a paid minute is before overtime and the break between work days are considered. */
export type Classification =
  | {
      readonly kind: "RULE";
      /** An ordinary or penalty window, a shiftwork rate or the public holiday rate. */
      readonly rule: RateRule;
      readonly overridden: readonly RateRule[];
    }
  /** Outside every ordinary-hours window for the day: overtime when overtime is priced. */
  | { readonly kind: "OUTSIDE_SPAN" }
  /** On a public holiday while the public holiday rule is disabled (older rule sets). */
  | { readonly kind: "PUBLIC_HOLIDAY" };

export interface Segment {
  readonly interval: Interval;
  readonly localDate: LocalDate;
  readonly weekday: Weekday;
  readonly classification: Classification;
  /** True when this minute falls on a public holiday (from its start time, for part days). */
  readonly publicHoliday: boolean;
}

export interface SegmentationContext {
  readonly zone: TimeZone;
  /** Enabled weekly-window rules already filtered to this employment. */
  readonly windowRules: readonly WeeklyWindowRule[];
  readonly publicHolidays: ReadonlyMap<string, ParsedPublicHoliday>;
  /** The enabled public holiday rule, or null when public holidays are not priced. */
  readonly publicHolidayRule: RateRule | null;
}

export interface ShiftworkContext {
  readonly rules: readonly ShiftworkRule[];
  readonly startsAtOrAfter: number;
  readonly startsBefore: number;
  readonly breaksPaid: boolean;
}

interface DayFrame {
  readonly date: LocalDate;
  readonly start: Instant;
  readonly end: Instant;
  /** Start of the public holiday on this date, if it is one. */
  readonly holidayStart: Instant | null;
  readonly windows: readonly { readonly rule: WeeklyWindowRule; readonly interval: Interval }[];
}

const appliesToEmployment = (rule: RateRule, employment: EmploymentTerms): boolean =>
  rule.status === "ENABLED" &&
  rule.appliesTo.classifications.includes(employment.classificationCode) &&
  rule.appliesTo.employmentTypes.includes(employment.employmentType) &&
  (rule.appliesTo.spanExceptions === undefined ||
    rule.appliesTo.spanExceptions.some((e) => e === employment.spanException));

/** Enabled WEEKLY_WINDOW rules for this classification, employment type and cl. 15.2 exception. */
export function applicableWindowRules(
  rules: readonly RateRule[],
  employment: EmploymentTerms,
): WeeklyWindowRule[] {
  return rules.filter(
    (rule): rule is WeeklyWindowRule =>
      rule.when.kind === "WEEKLY_WINDOW" && appliesToEmployment(rule, employment),
  );
}

/** The enabled public holiday rule for this employment, if the rule set prices public holidays. */
export function applicablePublicHolidayRule(
  rules: readonly RateRule[],
  employment: EmploymentTerms,
): RateRule | null {
  return (
    rules.find((rule) => rule.when.kind === "PUBLIC_HOLIDAY" && appliesToEmployment(rule, employment)) ?? null
  );
}

/** Part 6 shiftwork rates for this employment, or null when shiftwork is not modelled or declared. */
export function shiftworkContext(
  ruleSet: AwardRuleSet,
  employment: EmploymentTerms,
): ShiftworkContext | null {
  const definition = ruleSet.shiftwork;
  if (
    definition === undefined ||
    ruleSet.supportedScope.shiftwork !== true ||
    employment.declarations.shiftworker !== "YES"
  ) {
    return null;
  }
  const rules = ruleSet.rateRules.filter(
    (rule): rule is ShiftworkRule => rule.when.kind === "SHIFTWORK" && appliesToEmployment(rule, employment),
  );
  return {
    rules,
    startsAtOrAfter: LocalTime.parse(definition.startsAtOrAfter, "shiftwork.startsAtOrAfter").minuteOfDay,
    startsBefore: LocalTime.parse(definition.startsBefore, "shiftwork.startsBefore").minuteOfDay,
    breaksPaid: definition.breaksPaid,
  };
}

/**
 * Splits a shift's paid time into maximal non-overlapping segments, each lying on one local date
 * and under one classification.
 *
 * Cut points are every paid-interval edge, every local midnight, every rule-window edge and the
 * start of every part-day public holiday, so each piece between consecutive cuts is uniformly
 * classified. Windows are built from wall-clock times per local date and converted to instants,
 * which makes 23- and 25-hour days (DST transitions) correct by construction. Contiguous pieces with
 * identical classification are merged. Unpaid meal breaks are never part of any segment.
 */
export function segmentShift(
  shift: ResolvedShift,
  context: SegmentationContext,
  shiftwork: { readonly rules: readonly ShiftworkRule[]; readonly breaksPaid: boolean } | null = null,
): Segment[] {
  const paid = paidIntervals(shift, shiftwork?.breaksPaid ?? false);
  const frames = dayFrames(shift, context);

  const cuts = new Set<number>();
  for (const interval of paid) {
    cuts.add(interval.start.epochMs);
    cuts.add(interval.end.epochMs);
  }
  for (const frame of frames) {
    cuts.add(frame.start.epochMs);
    cuts.add(frame.end.epochMs);
    if (frame.holidayStart !== null) {
      cuts.add(frame.holidayStart.epochMs);
    }
    for (const window of frame.windows) {
      cuts.add(window.interval.start.epochMs);
      cuts.add(window.interval.end.epochMs);
    }
  }
  const lower = shift.interval.start.epochMs;
  const upper = shift.interval.end.epochMs;
  const points = [...cuts].filter((p) => p >= lower && p <= upper).sort((a, b) => a - b);
  // cl. 25.3(b): a shift that begins on a public holiday is a public holiday shift throughout.
  const startsOnHoliday =
    shiftwork !== null && context.publicHolidays.get(shift.record.start.date.toString())?.fromMinute === 0;

  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const piece = Interval.of(
      Instant.ofEpochMs(points[i - 1] as number),
      Instant.ofEpochMs(points[i] as number),
    );
    if (!paid.some((p) => p.encloses(piece))) {
      continue;
    }
    const frame = frames.find(
      (f) => !piece.start.isBefore(f.start) && piece.start.isBefore(f.end),
    ) as DayFrame;
    const holiday =
      startsOnHoliday || (frame.holidayStart !== null && !piece.start.isBefore(frame.holidayStart));
    const classification = classify(piece.start, frame, holiday, context, shiftwork);
    const previous = segments.at(-1);
    if (
      previous !== undefined &&
      previous.interval.end.equals(piece.start) &&
      previous.localDate.equals(frame.date) &&
      previous.publicHoliday === holiday &&
      sameClassification(previous.classification, classification)
    ) {
      segments[segments.length - 1] = {
        ...previous,
        interval: Interval.of(previous.interval.start, piece.end),
      };
    } else {
      segments.push({
        interval: piece,
        localDate: frame.date,
        weekday: frame.date.weekday(),
        classification,
        publicHoliday: holiday,
      });
    }
  }
  return segments;
}

/**
 * cl. 24.1 and 24.3: a shift is shiftwork when it starts at or after 6 pm or before 5 am, unless it
 * starts and finishes on the same day within the span of ordinary hours.
 */
export function isShiftworkShift(
  shift: ResolvedShift,
  context: SegmentationContext,
  shiftwork: ShiftworkContext,
): boolean {
  const startMinute = shift.record.start.time.minuteOfDay;
  if (startMinute < shiftwork.startsAtOrAfter && startMinute >= shiftwork.startsBefore) {
    return false;
  }
  const sameDay = context.zone
    .toLocal(shift.interval.end.plusMinutes(-1))
    .date.equals(shift.record.start.date);
  const withinSpan = segmentShift(shift, context).every((s) => s.classification.kind === "RULE");
  return !(sameDay && withinSpan);
}

function dayFrames(shift: ResolvedShift, context: SegmentationContext): DayFrame[] {
  const { zone } = context;
  const firstDate = zone.toLocal(shift.interval.start).date;
  const lastDate = zone.toLocal(shift.interval.end.plusMinutes(-1)).date;
  const frames: DayFrame[] = [];
  for (let date = firstDate; !date.isAfter(lastDate); date = date.plusDays(1)) {
    const start = zone.startOfDay(date);
    const end = zone.startOfDay(date.plusDays(1));
    const weekday = date.weekday();
    const windows = context.windowRules
      .filter((rule) => rule.when.days.includes(weekday))
      .map((rule) => ({ rule, interval: windowInterval(rule, date, zone, end) }));
    const holiday = context.publicHolidays.get(date.toString());
    const holidayStart =
      holiday === undefined
        ? null
        : holiday.fromMinute === 0
          ? start
          : zone.resolve(
              LocalDateTime.of(date, LocalTime.ofMinuteOfDay(holiday.fromMinute)),
              Disambiguation.EARLIER,
            );
    frames.push({ date, start, end, holidayStart, windows });
  }
  return frames;
}

function windowInterval(
  rule: WeeklyWindowRule,
  date: LocalDate,
  zone: TimeZone,
  endOfDay: Instant,
): Interval {
  const resolve = (hhmm: string): Instant => {
    const time = LocalTime.parse(hhmm, rule.id, { allowEndOfDay: true });
    return time.minuteOfDay === 1440
      ? endOfDay
      : zone.resolve(LocalDateTime.of(date, time), Disambiguation.EARLIER);
  };
  return Interval.of(resolve(rule.when.from), resolve(rule.when.to));
}

function classify(
  at: Instant,
  frame: DayFrame,
  holiday: boolean,
  context: SegmentationContext,
  shiftwork: { readonly rules: readonly ShiftworkRule[] } | null,
): Classification {
  const matches = frame.windows
    .filter((w) => w.interval.contains(at))
    .map((w) => w.rule)
    .sort((a, b) => b.precedence - a.precedence);
  if (holiday) {
    if (context.publicHolidayRule === null) {
      return { kind: "PUBLIC_HOLIDAY" };
    }
    // Shiftwork on a public holiday is paid at Table 12 rates for all hours (cl. 25.3(a)).
    if (shiftwork !== null || matches.length > 0) {
      return { kind: "RULE", rule: context.publicHolidayRule, overridden: matches };
    }
    return { kind: "OUTSIDE_SPAN" };
  }
  if (shiftwork !== null) {
    const rule = shiftwork.rules.find((r) => r.when.days.includes(frame.date.weekday()));
    if (rule !== undefined) {
      return { kind: "RULE", rule, overridden: matches };
    }
  }
  const [winner, ...overridden] = matches;
  return winner === undefined ? { kind: "OUTSIDE_SPAN" } : { kind: "RULE", rule: winner, overridden };
}

/**
 * Pieces merge only if both the winning rule and the set of rules it overrode are identical, so a
 * segment's explanation ("overrode X") is true for every minute in it.
 */
function sameClassification(a: Classification, b: Classification): boolean {
  if (a.kind === "RULE" && b.kind === "RULE") {
    const overriddenIds = (c: typeof a): string => c.overridden.map((r) => r.id).join(",");
    return a.rule.id === b.rule.id && overriddenIds(a) === overriddenIds(b);
  }
  return a.kind === b.kind;
}
