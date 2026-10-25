import type { AwardRuleSet, RateRule, RegisteredRuleSet } from "@wageguard/award-rules";
import {
  Decimal,
  EmploymentType,
  Interval,
  Money,
  contentHash,
  type Instant,
  type LocalDate,
  type ResolvedShift,
  type TimeZone,
} from "@wageguard/domain";

import { entitlementIssues, type PricedFeatures, type SegmentedShift } from "./checks.js";
import { allowanceLines, leaveLines } from "./extras.js";
import {
  parseCalculationInput,
  type ParsedCalculationInput,
  type PayPeriodCalculationInput,
} from "./input.js";
import { IssueSeverity, isBlocking, issue, type CalculationIssue } from "./issues.js";
import {
  applicableOvertimeRules,
  breakDeficitShiftIds,
  markOvertime,
  minutesOf,
  overtimeRuleFor,
  piecesFor,
  weekKey,
  type Piece,
} from "./overtime.js";
import {
  JuniorRateUnavailable,
  createPricer,
  minutesToHours,
  percentFor,
  type BaseRate,
  type RatePricer,
} from "./pricing.js";
import {
  CalculationStatus,
  TraceStepCode,
  type PayLine,
  type PayPeriodCalculationResult,
  type SegmentClassification,
  type SegmentResult,
  type ShiftResult,
  type TraceStep,
} from "./result.js";
import { canClassify, scopeIssues } from "./scope.js";
import {
  applicablePublicHolidayRule,
  applicableWindowRules,
  isShiftworkShift,
  segmentShift,
  shiftworkContext,
  type SegmentationContext,
} from "./segmentation.js";
import { ENGINE_VERSION, RESULT_SCHEMA_VERSION } from "./version.js";

/** Port: how the engine finds the rule set in force. Implemented by the award-rules registry. */
export interface RuleSetResolver {
  resolveForPayPeriod(awardCode: string, payPeriodStart: LocalDate): RegisteredRuleSet | null;
}

export interface CalculationContext {
  readonly rules: RuleSetResolver;
  /** Supplied by the caller so that the engine is free of hidden clock reads. */
  readonly calculatedAt: Instant;
}

const VERIFICATION_STATEMENT =
  "Rates were transcribed from the official award document and cross-checked by automated tests. " +
  "They have not been reviewed by a qualified payroll or legal professional. This is not legal advice.";

/** A piece of paid time with the rule and rate that pay it. */
interface PricedPiece {
  readonly piece: Piece;
  readonly rule: RateRule;
  readonly base: BaseRate;
  readonly rate: Money;
  /** Rules this piece would otherwise have been paid under (overridden by precedence or a higher rate). */
  readonly overridden: readonly RateRule[];
}

interface TopUp {
  readonly shiftId: string;
  readonly minutes: number;
  readonly rule: RateRule;
  readonly base: BaseRate;
  readonly rate: Money;
}

/**
 * Calculates the award minimum gross pay for one pay period.
 *
 * Pipeline: validate input -> resolve the rule set by pay period start -> check employment scope ->
 * segment shifts by local day, rule window and public holiday -> mark overtime (span, daily,
 * guaranteed and weekly) and the break-between-work-days rate -> price each piece at its base rate
 * (adult or junior on that day) -> top up short engagements -> add allowances and leave -> aggregate
 * pay lines -> determine status. Pure and deterministic: the same input, rule set and `calculatedAt`
 * always produce the same result, and the input is never mutated.
 *
 * @throws DomainValidationError when the input is malformed (all problems are reported at once).
 */
export function calculatePayPeriod(
  rawInput: unknown,
  context: CalculationContext,
): PayPeriodCalculationResult {
  const input = parseCalculationInput(rawInput);
  const inputHash = contentHash(input.normalised);
  const trace: TraceStep[] = [
    {
      step: TraceStepCode.INPUT_VALIDATED,
      detail: `${input.shifts.length} shift(s) validated and ordered by start time.`,
      data: { shiftCount: input.shifts.length, contextShiftCount: input.contextShifts.length, inputHash },
    },
  ];

  const registered = context.rules.resolveForPayPeriod(input.employment.awardCode, input.payPeriod.startDate);
  if (registered === null) {
    trace.push({
      step: TraceStepCode.RULE_SET_NOT_FOUND,
      detail: `No verified rule set for ${input.employment.awardCode} covers a pay period starting ${input.payPeriod.startDate.toString()}.`,
      data: { awardCode: input.employment.awardCode, payPeriodStart: input.payPeriod.startDate.toString() },
    });
    const issues = [
      issue(
        "NO_RULE_SET_FOR_PERIOD",
        `No verified rule set covers a pay period starting ${input.payPeriod.startDate.toString()}.`,
      ),
    ];
    return assemble({
      input,
      inputHash,
      context,
      registered: null,
      shifts: input.shifts.map(unclassifiedShift),
      lines: [],
      issues,
      trace,
    });
  }

  const { ruleSet } = registered;
  const { employment } = input;
  trace.push({
    step: TraceStepCode.RULE_SET_RESOLVED,
    detail: `Using ${ruleSet.version}, effective from the first full pay period starting on or after ${ruleSet.effective.from}.`,
    data: {
      ruleSetVersion: ruleSet.version,
      fingerprint: registered.fingerprint,
      sourceUrl: ruleSet.source.url,
    },
  });

  const scope = scopeIssues(employment, ruleSet);
  if (input.shifts.length === 0 && input.leave.length === 0) {
    scope.push(issue("NO_SHIFTS", "No shifts were provided for this pay period."));
  }
  trace.push({
    step: TraceStepCode.SCOPE_CHECKED,
    detail:
      scope.length === 0
        ? "Employment is within the supported scope."
        : `${scope.length} scope issue(s) found.`,
    data: { issueCodes: scope.map((i) => i.code) },
  });

  if (!canClassify(employment, ruleSet)) {
    return assemble({
      input,
      inputHash,
      context,
      registered,
      shifts: input.shifts.map(unclassifiedShift),
      lines: [],
      issues: scope,
      trace,
    });
  }

  // --- Segment every shift (context shifts too: they count towards limits) -------------------------
  const otRules = applicableOvertimeRules(ruleSet.rateRules, employment);
  const publicHolidayRule = applicablePublicHolidayRule(ruleSet.rateRules, employment);
  const breakRule =
    ruleSet.rateRules.find(
      (r) =>
        r.status === "ENABLED" &&
        r.when.kind === "INSUFFICIENT_BREAK" &&
        r.appliesTo.classifications.includes(employment.classificationCode) &&
        r.appliesTo.employmentTypes.includes(employment.employmentType),
    ) ?? null;
  const features: PricedFeatures = {
    overtime: otRules.length > 0,
    publicHolidays: publicHolidayRule !== null,
    minimumEngagement: ruleSet.schemaVersion >= 2,
    breakBetweenWorkDays: breakRule !== null,
  };
  const segmentation: SegmentationContext = {
    zone: employment.timeZone,
    windowRules: applicableWindowRules(ruleSet.rateRules, employment),
    publicHolidays: input.publicHolidays,
    publicHolidayRule,
  };
  const shiftwork = shiftworkContext(ruleSet, employment);
  const all = [...input.contextShifts, ...input.shifts].sort((a, b) =>
    a.interval.start.compare(b.interval.start),
  );
  const contextIds = new Set(input.contextShifts.map((s) => s.record.id));
  const shiftworkIds = new Set<string>();
  const segmentedAll: SegmentedShift[] = all.map((shift) => {
    const isShiftwork = shiftwork !== null && isShiftworkShift(shift, segmentation, shiftwork);
    if (isShiftwork) {
      shiftworkIds.add(shift.record.id);
    }
    return { shift, segments: segmentShift(shift, segmentation, isShiftwork ? shiftwork : null) };
  });
  const segmented = segmentedAll.filter((s) => !contextIds.has(s.shift.record.id));
  trace.push({
    step: TraceStepCode.SHIFTS_SEGMENTED,
    detail:
      "Paid time split at local midnight, rule-window boundaries, public holidays and unpaid meal breaks" +
      (shiftworkIds.size > 0 ? `; ${shiftworkIds.size} shift(s) priced as shiftwork (cl. 24.1, 25.1).` : "."),
    data: {
      segmentCount: segmented.reduce((n, s) => n + s.segments.length, 0),
      windowRuleIds: segmentation.windowRules.map((r) => r.id),
      shiftworkShiftIds: [...shiftworkIds].filter((id) => !contextIds.has(id)),
      publicHolidayDates: [...input.publicHolidays.keys()].sort(),
    },
  });

  // --- Overtime and the break between work days ------------------------------------------------------
  let pieces: Piece[] = segmentedAll.flatMap(({ shift, segments }) =>
    piecesFor(shift.record.id, segments, contextIds.has(shift.record.id)),
  );
  const extraIssues: CalculationIssue[] = [];
  const averagingBlocked = new Set<string>();
  if (features.overtime) {
    const outcome = markOvertime(pieces, {
      ruleSet,
      employment,
      guaranteedHoursVariations: input.guaranteedHoursVariations,
    });
    pieces = outcome.pieces;
    for (const week of outcome.averagingWeeks) {
      week.shiftIds.forEach((id) => averagingBlocked.add(id));
      extraIssues.push(
        issue(
          "AVERAGING_ROSTER_WEEKLY_HOURS",
          `${week.minutes} ordinary minutes in the week starting ${week.monday} exceed 38 hours under an averaging roster.`,
          { clauseRefs: ["15.6(g)", "21.2(a)"], shiftIds: week.shiftIds, date: week.monday },
        ),
      );
    }
  }
  if (breakRule !== null) {
    const required =
      employment.reducedBreakAgreed && ruleSet.constraints.agreedBreakBetweenWorkDays !== undefined
        ? ruleSet.constraints.agreedBreakBetweenWorkDays.minutes
        : ruleSet.constraints.minimumBreakBetweenWorkDays.minutes;
    const deficit = breakDeficitShiftIds(all, required);
    pieces = pieces.map((p) => (deficit.has(p.shiftId) ? { ...p, breakDeficit: true } : p));
  }
  const periodPieces = pieces.filter((p) => !p.context);
  const overtimeShiftIds = [
    ...new Set(periodPieces.filter((p) => p.overtime !== null).map((p) => p.shiftId)),
  ];
  if (overtimeShiftIds.length > 0) {
    const minutes = periodPieces.filter((p) => p.overtime !== null).reduce((n, p) => n + minutesOf(p), 0);
    extraIssues.push(
      issue("OVERTIME_CALCULATED", `${minutes} minute(s) were paid as overtime.`, {
        clauseRefs: ["10.8", "21.2"],
        shiftIds: overtimeShiftIds,
      }),
    );
  }

  const entitlement = entitlementIssues(segmented, employment, ruleSet, features);
  const pricer = createPricer(ruleSet, employment);
  const juniorIssues = juniorRateIssues(input, pricer);
  const issues = [...scope, ...juniorIssues, ...entitlement, ...extraIssues];
  trace.push({
    step: TraceStepCode.ENTITLEMENT_CHECKS_APPLIED,
    detail: features.overtime
      ? "Overtime marked (outside the span, beyond daily, guaranteed or weekly hours, last hours first), then the break between work days, minimum engagement and breaks checked."
      : "Checked span of hours, public holidays, minimum engagement, daily and weekly hours, guaranteed hours and breaks between work days.",
    data: {
      issueCodes: [...entitlement, ...extraIssues].map((i) => i.code),
      overtimeMinutes: periodPieces.filter((p) => p.overtime !== null).reduce((n, p) => n + minutesOf(p), 0),
    },
  });

  // --- Price -------------------------------------------------------------------------------------------
  const periodBlocked = scope.some(isBlocking) || juniorIssues.some(isBlocking);
  const blockedShiftIds = new Set([
    ...entitlement.filter(isBlocking).flatMap((i) => i.shiftIds),
    ...averagingBlocked,
  ]);
  const pricedByShift = new Map<string, PricedPiece[] | null>();
  for (const { shift } of segmented) {
    const id = shift.record.id;
    if (periodBlocked || blockedShiftIds.has(id)) {
      pricedByShift.set(id, null);
      continue;
    }
    const priced = periodPieces
      .filter((p) => p.shiftId === id)
      .map((p) => priceOne(p, { otRules, breakRule, pricer, employmentType: employment.employmentType }));
    pricedByShift.set(id, priced.some((p) => p === null) ? null : (priced as PricedPiece[]));
  }
  const topUps =
    features.minimumEngagement && !periodBlocked
      ? minimumEngagementTopUps(segmented, pricedByShift, input, ruleSet)
      : [];
  for (const topUp of topUps) {
    issues.push(
      issue(
        "MINIMUM_ENGAGEMENT_TOPPED_UP",
        `Shift ${topUp.shiftId} was topped up by ${topUp.minutes} minute(s) to the minimum engagement.`,
        { clauseRefs: engagementClauses(ruleSet, employment.employmentType), shiftIds: [topUp.shiftId] },
      ),
    );
  }
  const deficitPriced = [...pricedByShift.values()]
    .flatMap((p) => p ?? [])
    .filter((p) => p.rule === breakRule);
  if (deficitPriced.length > 0) {
    issues.push(
      issue(
        "BREAK_BETWEEN_WORK_DAYS_RATE_APPLIED",
        "Work before the required break between work days was paid at the cl. 16.6(b) rate.",
        {
          clauseRefs: ["16.6"],
          shiftIds: [...new Set(deficitPriced.map((p) => p.piece.shiftId))],
        },
      ),
    );
  }

  const shifts = segmented.map(({ shift }) =>
    buildShiftResult(shift, employment.timeZone, {
      pieces: periodPieces.filter((p) => p.shiftId === shift.record.id),
      priced: pricedByShift.get(shift.record.id) ?? null,
      topUp: topUps.find((t) => t.shiftId === shift.record.id) ?? null,
      pricer,
      employmentType: employment.employmentType,
      issueCodes: issues.filter((i) => i.shiftIds.includes(shift.record.id)).map((i) => i.code),
    }),
  );
  trace.push({
    step: TraceStepCode.RATES_APPLIED,
    detail: periodBlocked
      ? "No shifts priced: the pay period has unresolved scope issues."
      : `${shifts.filter((s) => s.priced).length} of ${shifts.length} shift(s) priced${topUps.length > 0 ? `; ${topUps.length} short engagement(s) topped up` : ""}.`,
    data: {
      baseHourlyRate: pricer.adultHourlyRate.toString(),
      pricedShiftIds: shifts.filter((s) => s.priced).map((s) => s.shiftId),
      unpricedShiftIds: shifts.filter((s) => !s.priced).map((s) => s.shiftId),
    },
  });

  // --- Lines -------------------------------------------------------------------------------------------
  const pricedPieces = [...pricedByShift.values()].flatMap((p) => p ?? []);
  const timeLines = aggregateTimeLines(pricedPieces, topUps, ruleSet, input, pricer);
  const pricedShiftIds = shifts.filter((s) => s.priced).map((s) => s.shiftId);
  const otByDate = new Map<string, number>();
  for (const p of pricedPieces.filter((p) => p.piece.overtime !== null)) {
    const key = p.piece.localDate.toString();
    otByDate.set(key, (otByDate.get(key) ?? 0) + minutesOf(p.piece));
  }
  const allowances = periodBlocked
    ? []
    : allowanceLines(
        ruleSet,
        employment,
        input.allowanceClaims,
        {
          weeksWorked: new Set(
            segmented
              .filter(({ shift }) => pricedShiftIds.includes(shift.record.id))
              .map(({ shift }) => weekKey(shift.record.start.date, shift.record.start.date.weekday())),
          ).size,
          shiftsWorked: pricedShiftIds.length,
          paidMinutes: shifts.filter((s) => s.priced).reduce((n, s) => n + s.paidMinutes, 0),
          overtimeMinutesByDate: otByDate,
          shiftIds: pricedShiftIds,
        },
        pricer,
      );
  const leave = periodBlocked
    ? { lines: [], issues: [] }
    : leaveLines(ruleSet, employment, input.leave, input.payPeriod.startDate, pricer);
  issues.push(...leave.issues);
  const lines = [...timeLines, ...allowances, ...leave.lines];
  trace.push({
    step: TraceStepCode.LINES_AGGREGATED,
    detail:
      "Minutes summed per rule and rate across priced shifts, each line rounded once; allowances and leave added.",
    data: { lineCount: lines.length, ruleIds: lines.map((l) => l.ruleId) },
  });

  return assemble({ input, inputHash, context, registered, shifts, lines, issues, trace });
}

function priceOne(
  piece: Piece,
  options: {
    readonly otRules: ReturnType<typeof applicableOvertimeRules>;
    readonly breakRule: RateRule | null;
    readonly pricer: RatePricer;
    readonly employmentType: EmploymentType;
  },
): PricedPiece | null {
  const { pricer, employmentType } = options;
  let rule: RateRule | null;
  const overridden: RateRule[] = [];
  if (piece.overtime !== null) {
    rule = overtimeRuleFor(piece, options.otRules);
    if (piece.classification.kind === "RULE") {
      overridden.push(piece.classification.rule);
    }
  } else {
    rule = piece.classification.kind === "RULE" ? piece.classification.rule : null;
    if (piece.classification.kind === "RULE") {
      overridden.push(...piece.classification.overridden);
    }
  }
  if (rule === null) {
    return null;
  }
  const breakRule = options.breakRule;
  if (
    piece.breakDeficit &&
    breakRule !== null &&
    new Decimal(percentFor(breakRule, employmentType)).greaterThan(percentFor(rule, employmentType))
  ) {
    overridden.unshift(rule);
    rule = breakRule;
  }
  const base = pricer.baseOn(piece.localDate);
  return { piece, rule, base, rate: pricer.hourlyRate(rule, base), overridden };
}

/**
 * cl. 10.9 and 11.2: casuals are engaged for at least 3 hours a day (1.5 for eligible school students
 * after school, cl. 11.3); part-timers for at least 3 consecutive hours a shift. Unworked minutes are
 * paid at the rate of the last minute worked, as if the shift had continued.
 */
function minimumEngagementTopUps(
  segmented: readonly SegmentedShift[],
  pricedByShift: ReadonlyMap<string, readonly PricedPiece[] | null>,
  input: ParsedCalculationInput,
  ruleSet: AwardRuleSet,
): TopUp[] {
  const { employment } = input;
  const engagement = ruleSet.constraints.minimumEngagement[employment.employmentType];
  if (engagement === undefined) {
    return [];
  }
  const groups: ResolvedShift[][] = [];
  if (employment.employmentType === EmploymentType.CASUAL) {
    const byDate = new Map<string, ResolvedShift[]>();
    for (const { shift } of segmented) {
      const key = shift.record.start.date.toString();
      byDate.set(key, [...(byDate.get(key) ?? []), shift]);
    }
    groups.push(...byDate.values());
  } else {
    groups.push(...segmented.map(({ shift }) => [shift]));
  }
  const school = ruleSet.constraints.schoolStudentEngagement;
  const topUps: TopUp[] = [];
  for (const group of groups) {
    const priced = group.map((s) => pricedByShift.get(s.record.id) ?? null);
    if (priced.some((p) => p === null || p.length === 0)) {
      continue;
    }
    const paid = priced.flat().reduce((n, p) => n + minutesOf((p as PricedPiece).piece), 0);
    const afterSchool =
      employment.schoolStudent &&
      school !== undefined &&
      group.every((s) => {
        const day = s.record.start.date.weekday();
        const from = Number(school.from.slice(0, 2)) * 60 + Number(school.from.slice(3));
        const to = Number(school.to.slice(0, 2)) * 60 + Number(school.to.slice(3));
        return (
          school.days.includes(day) &&
          s.record.end.date.equals(s.record.start.date) &&
          s.record.start.time.minuteOfDay >= from &&
          s.record.end.time.minuteOfDay <= to
        );
      });
    const required = afterSchool ? school.minutes : engagement.minutes;
    if (paid >= required) {
      continue;
    }
    const last = (priced.at(-1) as readonly PricedPiece[]).at(-1) as PricedPiece;
    topUps.push({
      shiftId: last.piece.shiftId,
      minutes: required - paid,
      rule: last.rule,
      base: last.base,
      rate: last.rate,
    });
  }
  return topUps;
}

function engagementClauses(ruleSet: AwardRuleSet, type: EmploymentType): string[] {
  return (ruleSet.constraints.minimumEngagement[type]?.sources ?? []).map((s) => s.clause);
}

function juniorRateIssues(input: ParsedCalculationInput, pricer: RatePricer): CalculationIssue[] {
  try {
    for (const shift of input.shifts) {
      pricer.baseOn(shift.record.start.date);
      pricer.baseOn(shift.record.end.date);
    }
    pricer.baseOn(input.payPeriod.startDate);
    return [];
  } catch (error: unknown) {
    if (error instanceof JuniorRateUnavailable) {
      return [
        issue(
          "EMPLOYMENT_START_DATE_MISSING",
          "An employment start date is needed for the age-20 junior rate.",
          { clauseRefs: ["17.2"] },
        ),
      ];
    }
    throw error;
  }
}

function buildShiftResult(
  shift: ResolvedShift,
  zone: TimeZone,
  options: {
    readonly pieces: readonly Piece[];
    readonly priced: readonly PricedPiece[] | null;
    readonly topUp: TopUp | null;
    readonly pricer: RatePricer;
    readonly employmentType: EmploymentType;
    readonly issueCodes: readonly string[];
  },
): ShiftResult {
  const { priced, pricer, employmentType } = options;
  const segments: SegmentResult[] =
    priced !== null
      ? mergePriced(priced).map((p) => ({
          ...segmentBase(p.piece, zone),
          classification: describeRule(p.rule, employmentType),
          overriddenRuleIds: p.overridden.map((r) => r.id),
          hourlyRate: p.rate.toString(),
          ...(p.piece.overtime === null ? {} : { overtimeReason: p.piece.overtime }),
          publicHoliday: p.piece.publicHoliday,
          baseRate: {
            band: p.base.band,
            hourlyRate: p.base.rate.toString(),
            juniorPercent: p.base.juniorPercent,
          },
        }))
      : options.pieces.map((piece) => ({
          ...segmentBase(piece, zone),
          classification: describeClassification(piece, employmentType),
          overriddenRuleIds:
            piece.classification.kind === "RULE" ? piece.classification.overridden.map((r) => r.id) : [],
          hourlyRate: null,
          ...(piece.overtime === null ? {} : { overtimeReason: piece.overtime }),
          publicHoliday: piece.publicHoliday,
        }));

  let indicativeAmount: string | null = null;
  if (priced !== null) {
    const groups = new Map<string, { rate: Money; minutes: number }>();
    for (const p of priced) {
      const key = `${p.rule.id}@${p.rate.toString()}`;
      const entry = groups.get(key) ?? { rate: p.rate, minutes: 0 };
      entry.minutes += minutesOf(p.piece);
      groups.set(key, entry);
    }
    const parts = [...groups.values()].map((g) => pricer.amount(g.rate, g.minutes));
    if (options.topUp !== null) {
      parts.push(pricer.amount(options.topUp.rate, options.topUp.minutes));
    }
    indicativeAmount = Money.sum(parts).toString();
  }

  const paidMinutes = options.pieces.reduce((sum, p) => sum + minutesOf(p), 0);
  return {
    shiftId: shift.record.id,
    priced: priced !== null,
    localStart: shift.record.start.toString(),
    localEnd: shift.record.end.toString(),
    elapsedMinutes: shift.interval.durationMinutes(),
    unpaidBreakMinutes: shift.interval.durationMinutes() - paidMinutes,
    paidMinutes,
    segments,
    indicativeAmount,
    issueCodes: [...new Set(options.issueCodes)],
    ...(options.topUp === null ? {} : { topUpMinutes: options.topUp.minutes }),
  };
}

/** Joins contiguous pieces paid under the same rule and rate on the same date. */
function mergePriced(priced: readonly PricedPiece[]): PricedPiece[] {
  const out: PricedPiece[] = [];
  for (const p of priced) {
    const previous = out.at(-1);
    if (
      previous !== undefined &&
      previous.rule === p.rule &&
      previous.rate.equals(p.rate) &&
      previous.piece.interval.end.equals(p.piece.interval.start) &&
      previous.piece.localDate.equals(p.piece.localDate) &&
      previous.piece.overtime === p.piece.overtime &&
      previous.piece.publicHoliday === p.piece.publicHoliday &&
      previous.overridden.map((r) => r.id).join() === p.overridden.map((r) => r.id).join()
    ) {
      out[out.length - 1] = {
        ...previous,
        piece: {
          ...previous.piece,
          interval: Interval.of(previous.piece.interval.start, p.piece.interval.end),
        },
      };
    } else {
      out.push(p);
    }
  }
  return out;
}

function segmentBase(piece: Piece, zone: TimeZone) {
  return {
    start: piece.interval.start.toString(),
    end: piece.interval.end.toString(),
    localStart: zone.toLocal(piece.interval.start).toString(),
    localEnd: zone.toLocal(piece.interval.end).toString(),
    localDate: piece.localDate.toString(),
    weekday: piece.weekday,
    minutes: minutesOf(piece),
  };
}

function describeRule(rule: RateRule, employmentType: EmploymentType): SegmentClassification {
  return {
    kind: "RULE",
    ruleId: rule.id,
    category: rule.category,
    description: rule.description,
    percentOfMinimumHourlyRate: percentFor(rule, employmentType),
    clauseRefs: rule.sources.map((s) => s.clause),
  };
}

function describeClassification(piece: Piece, employmentType: EmploymentType): SegmentClassification {
  const { classification } = piece;
  if (classification.kind !== "RULE") {
    return classification;
  }
  return describeRule(classification.rule, employmentType);
}

/** For pay periods that cannot be classified at all: paid time is reported, nothing is priced. */
function unclassifiedShift(shift: ResolvedShift): ShiftResult {
  const unpaid = shift.breaks
    .filter((b) => b.kind === "UNPAID_MEAL")
    .reduce((sum, b) => sum + b.interval.durationMinutes(), 0);
  return {
    shiftId: shift.record.id,
    priced: false,
    localStart: shift.record.start.toString(),
    localEnd: shift.record.end.toString(),
    elapsedMinutes: shift.interval.durationMinutes(),
    unpaidBreakMinutes: unpaid,
    paidMinutes: shift.interval.durationMinutes() - unpaid,
    segments: [],
    indicativeAmount: null,
    issueCodes: [],
  };
}

const TOP_UP_SUFFIX = "TOPUP.MINIMUM_ENGAGEMENT";

function aggregateTimeLines(
  priced: readonly PricedPiece[],
  topUps: readonly TopUp[],
  ruleSet: AwardRuleSet,
  input: ParsedCalculationInput,
  pricer: RatePricer,
): PayLine[] {
  const type = input.employment.employmentType;
  const order = input.shifts.map((s) => s.record.id);
  const totals = new Map<
    string,
    { rule: RateRule; base: BaseRate; rate: Money; minutes: number; shiftIds: Set<string> }
  >();
  for (const p of priced) {
    const key = `${p.rule.id}@${p.rate.toString()}`;
    const entry = totals.get(key) ?? {
      rule: p.rule,
      base: p.base,
      rate: p.rate,
      minutes: 0,
      shiftIds: new Set<string>(),
    };
    entry.minutes += minutesOf(p.piece);
    entry.shiftIds.add(p.piece.shiftId);
    totals.set(key, entry);
  }
  const ruleOrder = ruleSet.rateRules.map((r) => r.id);
  const lines: PayLine[] = [...totals.values()]
    .sort((a, b) => ruleOrder.indexOf(a.rule.id) - ruleOrder.indexOf(b.rule.id) || a.rate.compare(b.rate))
    .map(({ rule, base, rate, minutes, shiftIds }) => ({
      ruleId: rule.id,
      category: rule.category,
      description:
        base.band === "ADULT"
          ? rule.description
          : `${rule.description} (junior rate, ${base.juniorPercent}%)`,
      percentOfMinimumHourlyRate: percentFor(rule, type),
      baseHourlyRate: base.rate.toString(),
      hourlyRate: rate.toString(),
      minutes,
      hours: minutesToHours(minutes),
      amount: pricer.amount(rate, minutes).toString(),
      clauseRefs: rule.sources.map((s) => s.clause),
      shiftIds: order.filter((id) => shiftIds.has(id)),
      ...(ruleSet.schemaVersion >= 2 ? { unit: "HOUR" as const, quantity: minutesToHours(minutes) } : {}),
    }));

  const byRate = new Map<string, { topUp: TopUp; minutes: number; shiftIds: Set<string> }>();
  for (const topUp of topUps) {
    const key = `${topUp.rule.id}@${topUp.rate.toString()}`;
    const entry = byRate.get(key) ?? { topUp, minutes: 0, shiftIds: new Set<string>() };
    entry.minutes += topUp.minutes;
    entry.shiftIds.add(topUp.shiftId);
    byRate.set(key, entry);
  }
  for (const { topUp, minutes, shiftIds } of byRate.values()) {
    lines.push({
      ruleId: `${ruleSet.awardCode}.${TOP_UP_SUFFIX}`,
      category: "MINIMUM_ENGAGEMENT",
      description: `Minimum engagement top-up (at the ${topUp.rule.description.toLowerCase()} rate)`,
      percentOfMinimumHourlyRate: percentFor(topUp.rule, type),
      baseHourlyRate: topUp.base.rate.toString(),
      hourlyRate: topUp.rate.toString(),
      minutes,
      hours: minutesToHours(minutes),
      amount: pricer.amount(topUp.rate, minutes).toString(),
      clauseRefs: engagementClauses(ruleSet, type),
      shiftIds: order.filter((id) => shiftIds.has(id)),
      unit: "HOUR",
      quantity: minutesToHours(minutes),
    });
  }
  return lines;
}

const SEVERITY_TO_STATUS: readonly [IssueSeverity, CalculationStatus][] = [
  [IssueSeverity.UNSUPPORTED, CalculationStatus.UNSUPPORTED_SCENARIO],
  [IssueSeverity.INCOMPLETE_DATA, CalculationStatus.INCOMPLETE_DATA],
  [IssueSeverity.REVIEW_REQUIRED, CalculationStatus.REVIEW_REQUIRED],
];

export function statusFor(issues: readonly CalculationIssue[]): CalculationStatus {
  for (const [severity, status] of SEVERITY_TO_STATUS) {
    if (issues.some((i) => i.severity === severity)) {
      return status;
    }
  }
  return CalculationStatus.CALCULATED;
}

interface AssembleArgs {
  readonly input: ParsedCalculationInput;
  readonly inputHash: string;
  readonly context: CalculationContext;
  readonly registered: RegisteredRuleSet | null;
  readonly shifts: readonly ShiftResult[];
  readonly lines: readonly PayLine[];
  readonly issues: readonly CalculationIssue[];
  readonly trace: TraceStep[];
}

const TIME_CATEGORIES = new Set([
  "ORDINARY",
  "PENALTY",
  "PUBLIC_HOLIDAY",
  "OVERTIME",
  "SHIFTWORK",
  "BREAK_BETWEEN_WORK_DAYS",
  "MINIMUM_ENGAGEMENT",
]);

function assemble(args: AssembleArgs): PayPeriodCalculationResult {
  const { input, registered, shifts, lines, issues, trace } = args;
  const ruleSet = registered?.ruleSet ?? null;
  const status = statusFor(issues);
  const pricedMinutes = shifts.filter((s) => s.priced).reduce((sum, s) => sum + s.paidMinutes, 0);
  const paidMinutes = shifts.reduce((sum, s) => sum + s.paidMinutes, 0);
  const sum = (filter: (line: PayLine) => boolean) =>
    Money.sum(lines.filter(filter).map((l) => Money.of(l.amount)));
  const amount = sum(() => true);

  trace.push({
    step: TraceStepCode.STATUS_DETERMINED,
    detail:
      status === CalculationStatus.CALCULATED
        ? "Every paid minute was classified and priced."
        : `Status ${status}: ${paidMinutes - pricedMinutes} paid minute(s) not priced.`,
    data: { status, blockingIssueCount: issues.filter(isBlocking).length },
  });

  return {
    metadata: {
      resultSchemaVersion: RESULT_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      awardCode: input.employment.awardCode,
      ruleSetVersion: ruleSet?.version ?? null,
      ruleSetFingerprint: registered?.fingerprint ?? null,
      ruleSetEffectiveFrom: ruleSet?.effective.from ?? null,
      ruleSetEffectiveBasis: ruleSet?.effective.basis ?? null,
      sourceUrl: ruleSet?.source.url ?? null,
      sourceConsolidatedAsAt: ruleSet?.source.consolidatedAsAt ?? null,
      sourceRetrievedOn: ruleSet?.source.retrievedOn ?? null,
      classificationCode: input.employment.classificationCode,
      employmentType: input.employment.employmentType,
      timeZone: input.employment.timeZone.id,
      inputHash: args.inputHash,
      calculatedAt: args.context.calculatedAt.toString(),
      roundingPolicy: ruleSet?.roundingPolicy ?? null,
      verification: VERIFICATION_STATEMENT,
    },
    status,
    payPeriod: {
      startDate: input.payPeriod.startDate.toString(),
      endDate: input.payPeriod.endDate.toString(),
    },
    totals: {
      amount: amount.toString(),
      pricedMinutes,
      unpricedMinutes: paidMinutes - pricedMinutes,
      paidMinutes,
      isComplete: status === CalculationStatus.CALCULATED,
      timeAmount: sum((l) => TIME_CATEGORIES.has(l.category)).toString(),
      allowanceAmount: sum((l) => l.category === "ALLOWANCE").toString(),
      leaveAmount: sum((l) => l.category === "LEAVE" || l.category === "LEAVE_LOADING").toString(),
    },
    lines,
    shifts,
    issues,
    assumptions: assumptions(input, ruleSet),
    trace,
  };
}

function assumptions(input: ParsedCalculationInput, ruleSet: AwardRuleSet | null): string[] {
  const v2 = ruleSet !== null && ruleSet.schemaVersion >= 2;
  const list = [
    `Shift and break times are wall-clock times in ${input.employment.timeZone.id}; durations are measured on the UTC timeline, so daylight saving changes are accounted for.`,
    "A shift belongs to the pay period in which it starts.",
    "Breaks are taken exactly as recorded: meal breaks are unpaid and rest breaks are paid (all breaks are paid for shiftworkers, cl. 26). Unrecorded breaks are assumed not taken.",
    v2
      ? "Public holidays are the ones supplied for this pay period: the state calendar where the work was done, plus any the user added."
      : "Only dates declared as public holidays are treated as public holidays.",
    v2
      ? "Weekly hours count shifts supplied for the 13 days before the pay period as well as those in it. When hours go over a daily or weekly limit, the last hours worked are the overtime."
      : "Daily and weekly hour checks use only the shifts supplied for this pay period.",
    "The calculated amount is the award minimum. Employers may lawfully pay more.",
    "Employment details (award coverage, classification, employment type, age and shiftwork status) are as declared by the user.",
  ];
  if (v2) {
    list.push(
      "Overtime is calculated on a daily basis (cl. 21.2(b)): the first 3 hours of overtime each Monday to Saturday are at the first Table 11 rate.",
      "Minimum engagement top-ups are paid at the rate of the last minute worked, as if the shift had continued.",
      "Allowances paid per week are counted for each Monday-to-Sunday week with work in the period.",
    );
  }
  if (ruleSet !== null) {
    list.push(ruleSet.roundingPolicy.rationale);
  }
  return list;
}

/** Re-exported for callers that need the raw input contract. */
export type { PayPeriodCalculationInput };
