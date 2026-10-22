import type { AwardRuleSet, RuleConstraint } from "@wageguard/award-rules";
import {
  BreakKind,
  EmploymentType,
  paidIntervals,
  type EmploymentTerms,
  type ResolvedShift,
} from "@wageguard/domain";

import { issue, type CalculationIssue } from "./issues.js";
import type { Segment } from "./segmentation.js";

export interface SegmentedShift {
  readonly shift: ResolvedShift;
  readonly segments: readonly Segment[];
}

const clauses = (constraint: RuleConstraint): string[] => constraint.sources.map((s) => s.clause);

/**
 * Conditions under which part or all of a shift may attract an entitlement WageGuard does not
 * calculate (overtime, public holiday rates, minimum engagement, cl. 16.6 rates). Each produces a
 * REVIEW_REQUIRED issue naming the affected shifts; it never alters the classification itself.
 */
export function entitlementIssues(
  segmented: readonly SegmentedShift[],
  employment: EmploymentTerms,
  ruleSet: AwardRuleSet,
): CalculationIssue[] {
  return [
    ...segmented.flatMap((s) => shiftLevelIssues(s, employment, ruleSet)),
    ...dailyIssues(segmented, employment, ruleSet),
    ...casualWeeklyIssues(segmented, employment, ruleSet),
    ...breakBetweenWorkDaysIssues(segmented, ruleSet),
  ];
}

function shiftLevelIssues(
  { shift, segments }: SegmentedShift,
  employment: EmploymentTerms,
  ruleSet: AwardRuleSet,
): CalculationIssue[] {
  const id = shift.record.id;
  const issues: CalculationIssue[] = [];

  const outside = segments.filter((s) => s.classification.kind === "OUTSIDE_SPAN");
  if (outside.length > 0) {
    const minutes = outside.reduce((sum, s) => sum + s.interval.durationMinutes(), 0);
    issues.push(
      issue(
        "OUTSIDE_SPAN_OF_ORDINARY_HOURS",
        `Shift ${id} has ${minutes} paid minute(s) outside the span of ordinary hours for the day.`,
        { clauseRefs: ["15.1", "15.2", "21.2"], shiftIds: [id] },
      ),
    );
  }

  const holiday = segments.filter((s) => s.classification.kind === "PUBLIC_HOLIDAY");
  if (holiday.length > 0) {
    issues.push(
      issue("PUBLIC_HOLIDAY_NOT_SUPPORTED", `Shift ${id} includes work on a declared public holiday.`, {
        clauseRefs: ["22.1", "32"],
        shiftIds: [id],
        date: (holiday[0] as Segment).localDate.toString(),
      }),
    );
  }

  const engagement = ruleSet.constraints.minimumEngagement[employment.employmentType];
  const elapsed = shift.interval.durationMinutes();
  if (engagement !== undefined && elapsed < engagement.minutes) {
    issues.push(
      issue(
        "MINIMUM_ENGAGEMENT_SHORTFALL",
        `Shift ${id} lasted ${elapsed} minutes, less than the ${engagement.minutes}-minute minimum engagement.`,
        { clauseRefs: clauses(engagement), shiftIds: [id] },
      ),
    );
  }

  const mealLimit = ruleSet.constraints.mealBreakRequiredAfter;
  const longestStretch = Math.max(...paidIntervals(shift).map((i) => i.durationMinutes()));
  if (longestStretch > mealLimit.minutes) {
    const hasMeal = shift.breaks.some((b) => b.kind === BreakKind.UNPAID_MEAL);
    issues.push(
      issue(
        "NO_MEAL_BREAK_AFTER_FIVE_HOURS",
        hasMeal
          ? `Shift ${id} includes ${longestStretch} minutes of continuous work between meal breaks.`
          : `Shift ${id} records ${longestStretch} minutes of continuous work with no meal break.`,
        { clauseRefs: clauses(mealLimit), shiftIds: [id] },
      ),
    );
  }
  return issues;
}

/** Paid minutes per local date across all shifts (a cross-midnight shift contributes to two dates). */
function minutesByDate(
  segmented: readonly SegmentedShift[],
): Map<string, { minutes: number; shiftIds: Set<string> }> {
  const byDate = new Map<string, { minutes: number; shiftIds: Set<string> }>();
  for (const { shift, segments } of segmented) {
    for (const segment of segments) {
      const key = segment.localDate.toString();
      const entry = byDate.get(key) ?? { minutes: 0, shiftIds: new Set<string>() };
      entry.minutes += segment.interval.durationMinutes();
      entry.shiftIds.add(shift.record.id);
      byDate.set(key, entry);
    }
  }
  return byDate;
}

function dailyIssues(
  segmented: readonly SegmentedShift[],
  employment: EmploymentTerms,
  ruleSet: AwardRuleSet,
): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const maxDaily = ruleSet.constraints.maxOrdinaryPerDay;
  const guaranteed = employment.partTimeGuaranteedMinutes;

  for (const [date, { minutes, shiftIds }] of [...minutesByDate(segmented)].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const ids = [...shiftIds].sort();
    if (minutes > maxDaily.minutes) {
      issues.push(
        issue(
          "DAILY_ORDINARY_HOURS_EXCEEDED",
          `${minutes} paid minutes on ${date} exceed ${maxDaily.minutes} minutes.`,
          {
            clauseRefs: [...clauses(maxDaily), "21.2"],
            shiftIds: ids,
            date,
          },
        ),
      );
    }
    if (employment.employmentType === EmploymentType.PART_TIME && guaranteed !== null) {
      const weekday = (
        segmented.flatMap((s) => s.segments).find((s) => s.localDate.toString() === date) as Segment
      ).weekday;
      const allowed = guaranteed.get(weekday) ?? 0;
      if (minutes > allowed) {
        issues.push(
          issue(
            "PART_TIME_HOURS_EXCEED_GUARANTEED",
            `${minutes} paid minutes on ${date} (${weekday}) exceed the ${allowed} guaranteed minutes for that day.`,
            { clauseRefs: ["10.5", "10.6", "10.8"], shiftIds: ids, date },
          ),
        );
      }
    }
  }
  return issues;
}

/** Monday-to-Sunday weeks, keyed by the Monday's date. Only shifts supplied in this period count. */
function casualWeeklyIssues(
  segmented: readonly SegmentedShift[],
  employment: EmploymentTerms,
  ruleSet: AwardRuleSet,
): CalculationIssue[] {
  if (employment.employmentType !== EmploymentType.CASUAL) {
    return [];
  }
  const limit = ruleSet.constraints.casualWeeklyOrdinary;
  const byWeek = new Map<string, { minutes: number; shiftIds: Set<string> }>();
  for (const { shift, segments } of segmented) {
    for (const segment of segments) {
      const mondayOffset = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(segment.weekday);
      const key = segment.localDate.plusDays(-mondayOffset).toString();
      const entry = byWeek.get(key) ?? { minutes: 0, shiftIds: new Set<string>() };
      entry.minutes += segment.interval.durationMinutes();
      entry.shiftIds.add(shift.record.id);
      byWeek.set(key, entry);
    }
  }
  return [...byWeek]
    .filter(([, week]) => week.minutes > limit.minutes)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([monday, week]) =>
      issue(
        "CASUAL_WEEKLY_HOURS_EXCEEDED",
        `${week.minutes} paid minutes in the week starting ${monday} exceed ${limit.minutes} minutes.`,
        { clauseRefs: clauses(limit), shiftIds: [...week.shiftIds].sort(), date: monday },
      ),
    );
}

/** cl. 16.6: a break of less than 12 hours between finishing on one day and starting on the next. */
function breakBetweenWorkDaysIssues(
  segmented: readonly SegmentedShift[],
  ruleSet: AwardRuleSet,
): CalculationIssue[] {
  const limit = ruleSet.constraints.minimumBreakBetweenWorkDays;
  const issues: CalculationIssue[] = [];
  for (let i = 1; i < segmented.length; i += 1) {
    const previous = (segmented[i - 1] as SegmentedShift).shift;
    const current = (segmented[i] as SegmentedShift).shift;
    const differentDay = !current.record.start.date.equals(previous.record.start.date);
    const gap = previous.interval.end.minutesUntil(current.interval.start);
    if (differentDay && gap < limit.minutes) {
      issues.push(
        issue(
          "INSUFFICIENT_BREAK_BETWEEN_WORK_DAYS",
          `Shift ${current.record.id} starts ${gap} minutes after shift ${previous.record.id} ended (minimum ${limit.minutes}).`,
          {
            clauseRefs: clauses(limit),
            shiftIds: [current.record.id],
            date: current.record.start.date.toString(),
          },
        ),
      );
    }
  }
  return issues;
}
