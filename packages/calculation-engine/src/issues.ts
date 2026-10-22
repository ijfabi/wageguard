/**
 * Severity decides the overall status. Anything other than WARNING blocks a definitive result for
 * the minutes it affects.
 */
export const IssueSeverity = {
  /** Outside what WageGuard models. No figure is produced. */
  UNSUPPORTED: "UNSUPPORTED",
  /** Required information is missing. */
  INCOMPLETE_DATA: "INCOMPLETE_DATA",
  /** Possibly a different entitlement (overtime, public holiday...). Affected shifts are not priced. */
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  /** Informational; does not change the calculated pay. */
  WARNING: "WARNING",
} as const;
export type IssueSeverity = (typeof IssueSeverity)[keyof typeof IssueSeverity];

interface IssueDefinition {
  readonly severity: IssueSeverity;
  /** What the user can do about it. */
  readonly nextStep: string;
}

/** Catalogue of every issue the engine can raise. Codes are a stable public contract. */
export const ISSUE_DEFINITIONS = {
  NO_RULE_SET_FOR_PERIOD: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep:
      "WageGuard has no verified rates for this pay period. Use the Fair Work Pay Calculator for this period.",
  },
  AWARD_NOT_SUPPORTED: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep: "Only the General Retail Industry Award 2020 (MA000004) is supported.",
  },
  CLASSIFICATION_NOT_SUPPORTED: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep: "Only Retail Employee Level 1 is currently supported.",
  },
  EMPLOYMENT_TYPE_NOT_SUPPORTED: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep: "Only casual and part-time employment are currently supported.",
  },
  TIME_ZONE_NOT_SUPPORTED: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep: "Choose the Australian time zone where the work was performed.",
  },
  ENTERPRISE_AGREEMENT_APPLIES: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep:
      "Your pay is set by an enterprise agreement, which WageGuard does not model. Check the agreement or contact the Fair Work Ombudsman.",
  },
  ENTERPRISE_AGREEMENT_UNCONFIRMED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Check your contract or ask your employer whether an enterprise agreement applies, then update your employment profile.",
  },
  AWARD_COVERAGE_UNCONFIRMED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Confirm the award that covers your job (for example with the Fair Work Find my award tool), then update your employment profile.",
  },
  JUNIOR_RATES_NOT_SUPPORTED: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep: "Junior rates are not yet supported. Use the Fair Work Pay Calculator.",
  },
  AGE_UNCONFIRMED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep: "Confirm whether you were 21 or older for the whole pay period.",
  },
  SHIFTWORKER_NOT_SUPPORTED: {
    severity: IssueSeverity.UNSUPPORTED,
    nextStep: "Shiftwork rates (cl. 25) are not yet supported. Use the Fair Work Pay Calculator.",
  },
  SHIFTWORKER_STATUS_UNCONFIRMED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep: "Confirm whether you are employed specifically to do shiftwork.",
  },
  PART_TIME_GUARANTEED_HOURS_MISSING: {
    severity: IssueSeverity.INCOMPLETE_DATA,
    nextStep: "Enter the guaranteed hours for each day from your written part-time agreement.",
  },
  NO_SHIFTS: {
    severity: IssueSeverity.INCOMPLETE_DATA,
    nextStep: "Add the shifts you worked in this pay period.",
  },
  OUTSIDE_SPAN_OF_ORDINARY_HOURS: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Work outside the span of ordinary hours may be overtime, or ordinary hours under a cl. 15.2 exception. Check with your employer or the Fair Work Ombudsman.",
  },
  PUBLIC_HOLIDAY_NOT_SUPPORTED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Public holiday pay is not yet calculated. Check it against the Fair Work pay guide for MA000004.",
  },
  MINIMUM_ENGAGEMENT_SHORTFALL: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Shifts shorter than 3 hours may need to be paid as 3 hours (cl. 10.9, 11.2). Check how this shift was paid.",
  },
  DAILY_ORDINARY_HOURS_EXCEEDED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "More than 9 hours in a day may include overtime (cl. 15.4, 15.5, 21.2). Check how these hours were paid.",
  },
  PART_TIME_HOURS_EXCEED_GUARANTEED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Hours beyond your guaranteed hours are overtime unless the pattern was varied in writing (cl. 10.6, 10.8). Check any written variation.",
  },
  CASUAL_WEEKLY_HOURS_EXCEEDED: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "More than 38 hours in a week may include overtime (cl. 21.2). Check how these hours were paid.",
  },
  INSUFFICIENT_BREAK_BETWEEN_WORK_DAYS: {
    severity: IssueSeverity.REVIEW_REQUIRED,
    nextStep:
      "Starting again within 12 hours (or 10 hours by agreement) may attract 200% pay (cl. 16.6). Check how this shift was paid.",
  },
  NO_MEAL_BREAK_AFTER_FIVE_HOURS: {
    severity: IssueSeverity.WARNING,
    nextStep:
      "Your employer cannot require more than 5 hours of work without a meal break (cl. 16.5(c)). This does not change the calculated pay.",
  },
} as const satisfies Record<string, IssueDefinition>;

export type IssueCode = keyof typeof ISSUE_DEFINITIONS;

export interface CalculationIssue {
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly nextStep: string;
  readonly clauseRefs: readonly string[];
  /** Shifts affected; empty for pay-period-level issues. */
  readonly shiftIds: readonly string[];
  /** Local date the issue relates to, if any. */
  readonly date: string | null;
}

export function issue(
  code: IssueCode,
  message: string,
  options: { clauseRefs?: readonly string[]; shiftIds?: readonly string[]; date?: string } = {},
): CalculationIssue {
  const definition = ISSUE_DEFINITIONS[code];
  return {
    code,
    severity: definition.severity,
    message,
    nextStep: definition.nextStep,
    clauseRefs: options.clauseRefs ?? [],
    shiftIds: options.shiftIds ?? [],
    date: options.date ?? null,
  };
}

export function isBlocking(calculationIssue: CalculationIssue): boolean {
  return calculationIssue.severity !== IssueSeverity.WARNING;
}
