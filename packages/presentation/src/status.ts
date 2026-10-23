import type { AuditSummary } from "@wageguard/api-contracts";

export type FindingStatus = AuditSummary["findingStatus"];
export type CalculationStatus = AuditSummary["calculationStatus"];

/**
 * Visual tones. There is intentionally no "success" (green) tone: the award rules have not been
 * professionally reviewed, so even a match is presented as information, not as a verified pass.
 */
export type Tone = "info" | "warning" | "danger" | "neutral";

export interface StatusPresentation {
  readonly label: string;
  readonly description: string;
  readonly tone: Tone;
}

export const FINDING_STATUS: Readonly<Record<FindingStatus, StatusPresentation>> = {
  MATCHED: {
    label: "Matches calculated minimum",
    description:
      "Reported pay is within the rounding tolerance of the minimum WageGuard calculated for the supported hours. The rules have not been reviewed by a payroll professional.",
    tone: "info",
  },
  POTENTIAL_UNDERPAYMENT: {
    label: "Potential underpayment",
    description:
      "Reported pay is below the minimum WageGuard calculated. Check your entries, then raise it with your employer.",
    tone: "danger",
  },
  POTENTIAL_OVERPAYMENT: {
    label: "Paid above calculated minimum",
    description:
      "Reported pay is above the calculated minimum. Paying above the award is lawful, so this is not necessarily an error.",
    tone: "neutral",
  },
  REVIEW_REQUIRED: {
    label: "Needs review",
    description:
      "Some hours may attract entitlements WageGuard does not calculate (for example overtime or public holidays).",
    tone: "warning",
  },
  INCOMPLETE_DATA: {
    label: "More information needed",
    description: "Required information is missing, so no comparison was made.",
    tone: "warning",
  },
  UNSUPPORTED_SCENARIO: {
    label: "Not supported",
    description:
      "This situation is outside what WageGuard can calculate, so no expected amount was produced.",
    tone: "neutral",
  },
};

export const CALCULATION_STATUS: Readonly<Record<CalculationStatus, StatusPresentation>> = {
  CALCULATED: { label: "Fully calculated", description: "Every paid minute was priced.", tone: "info" },
  REVIEW_REQUIRED: {
    label: "Partially calculated",
    description: "Some shifts need review and were not priced.",
    tone: "warning",
  },
  UNSUPPORTED_SCENARIO: {
    label: "Not calculated",
    description: "Outside the supported scope.",
    tone: "neutral",
  },
  INCOMPLETE_DATA: {
    label: "Not calculated",
    description: "Required information is missing.",
    tone: "warning",
  },
};

/** Plain-language titles for calculation issue codes (see packages/calculation-engine/src/issues.ts). */
const ISSUE_TITLES: Readonly<Record<string, string>> = {
  NO_RULE_SET_FOR_PERIOD: "No verified rates for this pay period",
  AWARD_NOT_SUPPORTED: "Award not supported",
  CLASSIFICATION_NOT_SUPPORTED: "Classification not supported",
  EMPLOYMENT_TYPE_NOT_SUPPORTED: "Employment type not supported",
  TIME_ZONE_NOT_SUPPORTED: "Time zone not supported",
  ENTERPRISE_AGREEMENT_APPLIES: "An enterprise agreement applies",
  ENTERPRISE_AGREEMENT_UNCONFIRMED: "Enterprise agreement not confirmed",
  AWARD_COVERAGE_UNCONFIRMED: "Award coverage not confirmed",
  JUNIOR_RATES_NOT_SUPPORTED: "Junior rates not supported",
  AGE_UNCONFIRMED: "Age not confirmed",
  SHIFTWORKER_NOT_SUPPORTED: "Shiftwork not supported",
  SHIFTWORKER_STATUS_UNCONFIRMED: "Shiftworker status not confirmed",
  PART_TIME_GUARANTEED_HOURS_MISSING: "Guaranteed hours missing",
  NO_SHIFTS: "No shifts in this pay period",
  OUTSIDE_SPAN_OF_ORDINARY_HOURS: "Work outside ordinary hours",
  PUBLIC_HOLIDAY_NOT_SUPPORTED: "Public holiday work",
  MINIMUM_ENGAGEMENT_SHORTFALL: "Shift shorter than the minimum engagement",
  DAILY_ORDINARY_HOURS_EXCEEDED: "More than 9 hours in a day",
  PART_TIME_HOURS_EXCEED_GUARANTEED: "Hours beyond guaranteed hours",
  CASUAL_WEEKLY_HOURS_EXCEEDED: "More than 38 hours in a week",
  INSUFFICIENT_BREAK_BETWEEN_WORK_DAYS: "Less than 12 hours between work days",
  NO_MEAL_BREAK_AFTER_FIVE_HOURS: "Long stretch without a meal break",
};

export function issueTitle(code: string): string {
  return (
    ISSUE_TITLES[code] ??
    code
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase())
  );
}
