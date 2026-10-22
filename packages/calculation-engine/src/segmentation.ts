import {
  Disambiguation,
  Instant,
  Interval,
  LocalDateTime,
  LocalTime,
  paidIntervals,
  type EmploymentType,
  type LocalDate,
  type ResolvedShift,
  type TimeZone,
  type Weekday,
} from "@wageguard/domain";
import type { RateRule, WeeklyWindowRule } from "@wageguard/award-rules";

export type Classification =
  | {
      readonly kind: "RULE";
      readonly rule: WeeklyWindowRule;
      readonly overridden: readonly WeeklyWindowRule[];
    }
  | { readonly kind: "OUTSIDE_SPAN" }
  | { readonly kind: "PUBLIC_HOLIDAY" };

export interface Segment {
  readonly interval: Interval;
  readonly localDate: LocalDate;
  readonly weekday: Weekday;
  readonly classification: Classification;
}

export interface SegmentationContext {
  readonly zone: TimeZone;
  /** Enabled weekly-window rules already filtered to the employment's classification and type. */
  readonly windowRules: readonly WeeklyWindowRule[];
  readonly publicHolidays: ReadonlySet<string>;
}

interface DayFrame {
  readonly date: LocalDate;
  readonly start: Instant;
  readonly end: Instant;
  readonly windows: readonly { readonly rule: WeeklyWindowRule; readonly interval: Interval }[];
}

/** Enabled WEEKLY_WINDOW rules that apply to this classification and employment type. */
export function applicableWindowRules(
  rules: readonly RateRule[],
  classificationCode: string,
  employmentType: EmploymentType,
): WeeklyWindowRule[] {
  return rules.filter(
    (rule): rule is WeeklyWindowRule =>
      rule.status === "ENABLED" &&
      rule.when.kind === "WEEKLY_WINDOW" &&
      rule.appliesTo.classifications.includes(classificationCode) &&
      rule.appliesTo.employmentTypes.includes(employmentType),
  );
}

/**
 * Splits a shift's paid time into maximal non-overlapping segments, each lying on one local date
 * and under one classification.
 *
 * Cut points are every paid-interval edge, every local midnight and every rule-window edge, so
 * each elementary piece between consecutive cuts is uniformly classified. Windows are built from
 * wall-clock times per local date and converted to instants, which makes 23- and 25-hour days
 * (DST transitions) correct by construction. Pieces are then merged when contiguous and identically
 * classified. Unpaid meal breaks are never part of any segment.
 */
export function segmentShift(shift: ResolvedShift, context: SegmentationContext): Segment[] {
  const paid = paidIntervals(shift);
  const frames = dayFrames(shift, context);

  const cuts = new Set<number>();
  for (const interval of paid) {
    cuts.add(interval.start.epochMs);
    cuts.add(interval.end.epochMs);
  }
  for (const frame of frames) {
    cuts.add(frame.start.epochMs);
    cuts.add(frame.end.epochMs);
    for (const window of frame.windows) {
      cuts.add(window.interval.start.epochMs);
      cuts.add(window.interval.end.epochMs);
    }
  }
  const lower = shift.interval.start.epochMs;
  const upper = shift.interval.end.epochMs;
  const points = [...cuts].filter((p) => p >= lower && p <= upper).sort((a, b) => a - b);

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
    const classification = classify(piece.start, frame, context);
    const previous = segments.at(-1);
    if (
      previous !== undefined &&
      previous.interval.end.equals(piece.start) &&
      previous.localDate.equals(frame.date) &&
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
      });
    }
  }
  return segments;
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
    frames.push({ date, start, end, windows });
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

function classify(at: Instant, frame: DayFrame, context: SegmentationContext): Classification {
  if (context.publicHolidays.has(frame.date.toString())) {
    return { kind: "PUBLIC_HOLIDAY" };
  }
  const matches = frame.windows
    .filter((w) => w.interval.contains(at))
    .map((w) => w.rule)
    .sort((a, b) => b.precedence - a.precedence);
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
