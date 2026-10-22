import type { RoundingMode, Weekday } from "@wageguard/domain";

import type { CalculationIssue } from "./issues.js";

export const CalculationStatus = {
  /** Every paid minute was classified and priced under enabled, source-transcribed rules. */
  CALCULATED: "CALCULATED",
  /** Some minutes may attract an entitlement WageGuard does not calculate; they are not priced. */
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  UNSUPPORTED_SCENARIO: "UNSUPPORTED_SCENARIO",
  INCOMPLETE_DATA: "INCOMPLETE_DATA",
} as const;
export type CalculationStatus = (typeof CalculationStatus)[keyof typeof CalculationStatus];

export type SegmentClassification =
  | {
      readonly kind: "RULE";
      readonly ruleId: string;
      readonly category: string;
      readonly description: string;
      readonly percentOfMinimumHourlyRate: string;
      readonly clauseRefs: readonly string[];
    }
  /** Paid time outside every enabled ordinary/penalty window: possible overtime. */
  | { readonly kind: "OUTSIDE_SPAN" }
  /** Paid time on a declared public holiday (rule disabled). */
  | { readonly kind: "PUBLIC_HOLIDAY" };

/** A maximal run of paid time on one local date under one classification. */
export interface SegmentResult {
  readonly start: string;
  readonly end: string;
  readonly localStart: string;
  readonly localEnd: string;
  readonly localDate: string;
  readonly weekday: Weekday;
  readonly minutes: number;
  readonly classification: SegmentClassification;
  /** Rules that also matched but lost on precedence. Empty when unambiguous. */
  readonly overriddenRuleIds: readonly string[];
  /** Null when the shift is not priced. */
  readonly hourlyRate: string | null;
}

export interface ShiftResult {
  readonly shiftId: string;
  readonly priced: boolean;
  readonly localStart: string;
  readonly localEnd: string;
  readonly elapsedMinutes: number;
  readonly unpaidBreakMinutes: number;
  readonly paidMinutes: number;
  readonly segments: readonly SegmentResult[];
  /**
   * Informational per-shift amount (each shift/rule group rounded separately). Null when not
   * priced. The pay period total is the sum of {@link PayLine} amounts, not of these.
   */
  readonly indicativeAmount: string | null;
  readonly issueCodes: readonly string[];
}

/** One pay line per rule for the whole pay period, as a payslip would present it. */
export interface PayLine {
  readonly ruleId: string;
  readonly category: string;
  readonly description: string;
  readonly percentOfMinimumHourlyRate: string;
  readonly baseHourlyRate: string;
  readonly hourlyRate: string;
  readonly minutes: number;
  /** minutes / 60 to 4 decimal places, for display. Amounts are computed from minutes. */
  readonly hours: string;
  readonly amount: string;
  readonly clauseRefs: readonly string[];
  readonly shiftIds: readonly string[];
}

export interface RoundingPolicySnapshot {
  readonly hourlyRate: { readonly decimalPlaces: number; readonly mode: RoundingMode };
  readonly lineAmount: { readonly decimalPlaces: number; readonly mode: RoundingMode };
  readonly aggregation: string;
  readonly rationale: string;
}

export interface CalculationMetadata {
  readonly resultSchemaVersion: number;
  readonly engineVersion: string;
  readonly awardCode: string;
  readonly ruleSetVersion: string | null;
  readonly ruleSetFingerprint: string | null;
  readonly ruleSetEffectiveFrom: string | null;
  readonly ruleSetEffectiveBasis: string | null;
  readonly sourceUrl: string | null;
  readonly sourceConsolidatedAsAt: string | null;
  readonly sourceRetrievedOn: string | null;
  readonly classificationCode: string;
  readonly employmentType: string;
  readonly timeZone: string;
  /** SHA-256 of the canonical (sorted) input. Identical inputs always hash identically. */
  readonly inputHash: string;
  /** Injected by the caller; the engine never reads the clock. */
  readonly calculatedAt: string;
  readonly roundingPolicy: RoundingPolicySnapshot | null;
  readonly verification: string;
}

export const TraceStepCode = {
  INPUT_VALIDATED: "INPUT_VALIDATED",
  RULE_SET_RESOLVED: "RULE_SET_RESOLVED",
  RULE_SET_NOT_FOUND: "RULE_SET_NOT_FOUND",
  SCOPE_CHECKED: "SCOPE_CHECKED",
  SHIFTS_SEGMENTED: "SHIFTS_SEGMENTED",
  ENTITLEMENT_CHECKS_APPLIED: "ENTITLEMENT_CHECKS_APPLIED",
  RATES_APPLIED: "RATES_APPLIED",
  LINES_AGGREGATED: "LINES_AGGREGATED",
  STATUS_DETERMINED: "STATUS_DETERMINED",
} as const;
export type TraceStepCode = (typeof TraceStepCode)[keyof typeof TraceStepCode];

export type TraceValue = string | number | boolean | null | readonly string[];

export interface TraceStep {
  readonly step: TraceStepCode;
  readonly detail: string;
  readonly data: Readonly<Record<string, TraceValue>>;
}

export interface PayPeriodCalculationResult {
  readonly metadata: CalculationMetadata;
  readonly status: CalculationStatus;
  readonly payPeriod: { readonly startDate: string; readonly endDate: string };
  readonly totals: {
    /** Sum of pay lines: the award minimum for priced shifts only. */
    readonly amount: string;
    readonly pricedMinutes: number;
    /** Paid minutes in shifts that were not priced (review required / unsupported). */
    readonly unpricedMinutes: number;
    readonly paidMinutes: number;
    /** True only when status is CALCULATED: the amount covers every paid minute. */
    readonly isComplete: boolean;
  };
  readonly lines: readonly PayLine[];
  readonly shifts: readonly ShiftResult[];
  readonly issues: readonly CalculationIssue[];
  readonly assumptions: readonly string[];
  readonly trace: readonly TraceStep[];
}
