import type { AwardRuleSet, RegisteredRuleSet, WeeklyWindowRule } from "@wageguard/award-rules";
import {
  Money,
  contentHash,
  type Instant,
  type LocalDate,
  type ResolvedShift,
  type TimeZone,
} from "@wageguard/domain";

import { entitlementIssues, type SegmentedShift } from "./checks.js";
import {
  parseCalculationInput,
  type ParsedCalculationInput,
  type PayPeriodCalculationInput,
} from "./input.js";
import { IssueSeverity, isBlocking, issue, type CalculationIssue } from "./issues.js";
import { createPricer, minutesToHours, percentFor, type RatePricer } from "./pricing.js";
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
import { applicableWindowRules, segmentShift, type Segment } from "./segmentation.js";
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

/**
 * Calculates the award minimum gross pay for time worked in one pay period.
 *
 * Pipeline: validate input -> resolve the rule set by pay period start -> check employment scope ->
 * segment shifts by local day and rule window -> apply entitlement checks -> price unaffected
 * shifts -> aggregate pay lines -> determine status. Pure and deterministic: the same input, rule
 * set and `calculatedAt` always produce the same result, and the input is never mutated.
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
      data: { shiftCount: input.shifts.length, inputHash },
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
  trace.push({
    step: TraceStepCode.RULE_SET_RESOLVED,
    detail: `Using ${ruleSet.version}, effective from the first full pay period starting on or after ${ruleSet.effective.from}.`,
    data: {
      ruleSetVersion: ruleSet.version,
      fingerprint: registered.fingerprint,
      sourceUrl: ruleSet.source.url,
    },
  });

  const scope = scopeIssues(input.employment, ruleSet);
  if (input.shifts.length === 0) {
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

  if (!canClassify(input.employment, ruleSet)) {
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

  const windowRules = applicableWindowRules(
    ruleSet.rateRules,
    input.employment.classificationCode,
    input.employment.employmentType,
  );
  const segmented: SegmentedShift[] = input.shifts.map((shift) => ({
    shift,
    segments: segmentShift(shift, {
      zone: input.employment.timeZone,
      windowRules,
      publicHolidays: input.publicHolidays,
    }),
  }));
  trace.push({
    step: TraceStepCode.SHIFTS_SEGMENTED,
    detail: "Paid time split at local midnight, rule-window boundaries and unpaid meal breaks.",
    data: {
      segmentCount: segmented.reduce((n, s) => n + s.segments.length, 0),
      windowRuleIds: windowRules.map((r) => r.id),
    },
  });

  const entitlement = entitlementIssues(segmented, input.employment, ruleSet);
  const issues = [...scope, ...entitlement];
  trace.push({
    step: TraceStepCode.ENTITLEMENT_CHECKS_APPLIED,
    detail:
      "Checked span of hours, public holidays, minimum engagement, daily and weekly hours, guaranteed hours and breaks between work days.",
    data: { issueCodes: entitlement.map((i) => i.code) },
  });

  const periodBlocked = scope.some(isBlocking);
  const blockedShiftIds = new Set(entitlement.filter(isBlocking).flatMap((i) => i.shiftIds));
  const pricer = createPricer(ruleSet, input.employment.classificationCode, input.employment.employmentType);
  const shifts = segmented.map((s) =>
    buildShiftResult(s, input.employment.timeZone, input.employment.employmentType, {
      pricer: periodBlocked || blockedShiftIds.has(s.shift.record.id) ? null : pricer,
      issueCodes: issues.filter((i) => i.shiftIds.includes(s.shift.record.id)).map((i) => i.code),
    }),
  );
  trace.push({
    step: TraceStepCode.RATES_APPLIED,
    detail: periodBlocked
      ? "No shifts priced: the pay period has unresolved scope issues."
      : `${shifts.filter((s) => s.priced).length} of ${shifts.length} shift(s) priced; the rest need review.`,
    data: {
      baseHourlyRate: pricer.baseHourlyRate.toString(),
      pricedShiftIds: shifts.filter((s) => s.priced).map((s) => s.shiftId),
      unpricedShiftIds: shifts.filter((s) => !s.priced).map((s) => s.shiftId),
    },
  });

  const lines = aggregateLines(
    segmented.filter((_, i) => (shifts[i] as ShiftResult).priced),
    ruleSet,
    input,
    pricer,
  );
  trace.push({
    step: TraceStepCode.LINES_AGGREGATED,
    detail: "Minutes summed per rule across priced shifts; each line rounded once.",
    data: { lineCount: lines.length, ruleIds: lines.map((l) => l.ruleId) },
  });

  return assemble({ input, inputHash, context, registered, shifts, lines, issues, trace });
}

function buildShiftResult(
  { shift, segments }: SegmentedShift,
  zone: TimeZone,
  employmentType: ParsedCalculationInput["employment"]["employmentType"],
  options: { pricer: RatePricer | null; issueCodes: readonly string[] },
): ShiftResult {
  const { pricer } = options;
  const segmentResults: SegmentResult[] = segments.map((segment) => ({
    start: segment.interval.start.toString(),
    end: segment.interval.end.toString(),
    localStart: zone.toLocal(segment.interval.start).toString(),
    localEnd: zone.toLocal(segment.interval.end).toString(),
    localDate: segment.localDate.toString(),
    weekday: segment.weekday,
    minutes: segment.interval.durationMinutes(),
    classification: describeClassification(segment, employmentType),
    overriddenRuleIds:
      segment.classification.kind === "RULE" ? segment.classification.overridden.map((r) => r.id) : [],
    hourlyRate:
      pricer !== null && segment.classification.kind === "RULE"
        ? pricer.hourlyRate(segment.classification.rule).toString()
        : null,
  }));

  let indicativeAmount: string | null = null;
  if (pricer !== null) {
    const minutesByRule = new Map<WeeklyWindowRule, number>();
    for (const segment of segments) {
      if (segment.classification.kind === "RULE") {
        const rule = segment.classification.rule;
        minutesByRule.set(rule, (minutesByRule.get(rule) ?? 0) + segment.interval.durationMinutes());
      }
    }
    indicativeAmount = Money.sum(
      [...minutesByRule].map(([rule, minutes]) => pricer.amount(pricer.hourlyRate(rule), minutes)),
    ).toString();
  }

  const paidMinutes = segments.reduce((sum, s) => sum + s.interval.durationMinutes(), 0);
  return {
    shiftId: shift.record.id,
    priced: pricer !== null,
    localStart: shift.record.start.toString(),
    localEnd: shift.record.end.toString(),
    elapsedMinutes: shift.interval.durationMinutes(),
    unpaidBreakMinutes: shift.interval.durationMinutes() - paidMinutes,
    paidMinutes,
    segments: segmentResults,
    indicativeAmount,
    issueCodes: [...new Set(options.issueCodes)],
  };
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

function describeClassification(
  segment: Segment,
  employmentType: ParsedCalculationInput["employment"]["employmentType"],
): SegmentClassification {
  const { classification } = segment;
  if (classification.kind !== "RULE") {
    return classification;
  }
  const { rule } = classification;
  return {
    kind: "RULE",
    ruleId: rule.id,
    category: rule.category,
    description: rule.description,
    percentOfMinimumHourlyRate: percentFor(rule, employmentType),
    clauseRefs: rule.sources.map((s) => s.clause),
  };
}

function aggregateLines(
  priced: readonly SegmentedShift[],
  ruleSet: AwardRuleSet,
  input: ParsedCalculationInput,
  pricer: RatePricer,
): PayLine[] {
  const totals = new Map<string, { rule: WeeklyWindowRule; minutes: number; shiftIds: Set<string> }>();
  for (const { shift, segments } of priced) {
    for (const segment of segments) {
      if (segment.classification.kind !== "RULE") {
        continue;
      }
      const { rule } = segment.classification;
      const entry = totals.get(rule.id) ?? { rule, minutes: 0, shiftIds: new Set<string>() };
      entry.minutes += segment.interval.durationMinutes();
      entry.shiftIds.add(shift.record.id);
      totals.set(rule.id, entry);
    }
  }
  const ruleOrder = ruleSet.rateRules.map((r) => r.id);
  return [...totals.values()]
    .sort((a, b) => ruleOrder.indexOf(a.rule.id) - ruleOrder.indexOf(b.rule.id))
    .map(({ rule, minutes, shiftIds }) => {
      const hourlyRate = pricer.hourlyRate(rule);
      return {
        ruleId: rule.id,
        category: rule.category,
        description: rule.description,
        percentOfMinimumHourlyRate: percentFor(rule, input.employment.employmentType),
        baseHourlyRate: pricer.baseHourlyRate.toString(),
        hourlyRate: hourlyRate.toString(),
        minutes,
        hours: minutesToHours(minutes),
        amount: pricer.amount(hourlyRate, minutes).toString(),
        clauseRefs: rule.sources.map((s) => s.clause),
        shiftIds: input.shifts.map((s) => s.record.id).filter((id) => shiftIds.has(id)),
      };
    });
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

function assemble(args: AssembleArgs): PayPeriodCalculationResult {
  const { input, registered, shifts, lines, issues, trace } = args;
  const ruleSet = registered?.ruleSet ?? null;
  const status = statusFor(issues);
  const pricedMinutes = shifts.filter((s) => s.priced).reduce((sum, s) => sum + s.paidMinutes, 0);
  const paidMinutes = shifts.reduce((sum, s) => sum + s.paidMinutes, 0);
  const amount = Money.sum(lines.map((l) => Money.of(l.amount)));

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
    },
    lines,
    shifts,
    issues,
    assumptions: assumptions(input, ruleSet),
    trace,
  };
}

function assumptions(input: ParsedCalculationInput, ruleSet: AwardRuleSet | null): string[] {
  const list = [
    `Shift and break times are wall-clock times in ${input.employment.timeZone.id}; durations are measured on the UTC timeline, so daylight saving changes are accounted for.`,
    "A shift belongs to the pay period in which it starts.",
    "Breaks are taken exactly as recorded: meal breaks are unpaid and rest breaks are paid. Unrecorded breaks are assumed not taken.",
    "Only dates declared as public holidays are treated as public holidays.",
    "Daily and weekly hour checks use only the shifts supplied for this pay period.",
    "The calculated amount is the award minimum for time worked. Employers may lawfully pay more, and allowances and leave are not included.",
    "Employment details (award coverage, classification, employment type, age and shiftwork status) are as declared by the user.",
  ];
  if (ruleSet !== null) {
    list.push(ruleSet.roundingPolicy.rationale);
  }
  return list;
}

/** Re-exported for callers that need the raw input contract. */
export type { PayPeriodCalculationInput };
