import {
  Decimal,
  Money,
  PayslipLineCategory,
  RoundingMode,
  payslipCategoryTotal,
  type Payslip,
} from "@wageguard/domain";

import { IssueSeverity, isBlocking, type CalculationIssue } from "./issues.js";
import { CalculationStatus, type PayPeriodCalculationResult } from "./result.js";

export const FindingStatus = {
  MATCHED: "MATCHED",
  POTENTIAL_UNDERPAYMENT: "POTENTIAL_UNDERPAYMENT",
  POTENTIAL_OVERPAYMENT: "POTENTIAL_OVERPAYMENT",
  INCOMPLETE_DATA: "INCOMPLETE_DATA",
  UNSUPPORTED_SCENARIO: "UNSUPPORTED_SCENARIO",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
} as const;
export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

export const ComparisonBasis = {
  /** Itemised payslip: hours-worked and overtime lines compared; allowances, leave and other excluded. */
  ITEMISED_TIME_WORKED: "ITEMISED_TIME_WORKED",
  /** Gross only: may include allowances or leave, so an apparent overpayment is weak evidence. */
  GROSS_PAY: "GROSS_PAY",
} as const;
export type ComparisonBasis = (typeof ComparisonBasis)[keyof typeof ComparisonBasis];

export interface AuditFinding {
  readonly id: string;
  readonly scope: "PAY_PERIOD" | "SHIFT";
  readonly status: FindingStatus;
  readonly title: string;
  readonly explanation: string;
  readonly expectedAmount: string | null;
  readonly reportedAmount: string | null;
  /** reported - expected. Negative means paid less than the calculated minimum. */
  readonly difference: string | null;
  readonly shiftIds: readonly string[];
  readonly ruleIds: readonly string[];
  readonly clauseRefs: readonly string[];
  /** JSON pointers into the calculation result that support this finding. */
  readonly evidenceRefs: readonly string[];
  readonly verificationStatus: "RULES_TRANSCRIBED_HUMAN_REVIEW_PENDING" | "NOT_CALCULATED";
  readonly nextStep: string;
}

export interface ReconciliationResult {
  readonly status: FindingStatus;
  readonly comparisonBasis: ComparisonBasis;
  readonly expectedAmount: string | null;
  readonly reportedAmount: string;
  readonly difference: string | null;
  readonly roundingTolerance: string;
  readonly findings: readonly AuditFinding[];
  readonly notes: readonly string[];
}

const CENT = new Decimal("0.01");

/**
 * Compares a calculation with a payslip.
 *
 * Status rules:
 * - UNSUPPORTED_SCENARIO / INCOMPLETE_DATA calculations produce no comparison.
 * - Complete calculations: |difference| within the rounding tolerance -> MATCHED; below ->
 *   POTENTIAL_UNDERPAYMENT; above -> POTENTIAL_OVERPAYMENT (lawful over-award pay is possible).
 * - REVIEW_REQUIRED calculations price only some shifts. Unpriced time can only add to the
 *   minimum, so the priced amount is a lower bound: reported pay below it is a POTENTIAL_UNDERPAYMENT;
 *   otherwise REVIEW_REQUIRED.
 *
 * The rounding tolerance is one cent per (shift, rule) pricing group, covering employers that round
 * per shift rather than per pay line.
 */
export function reconcile(calculation: PayPeriodCalculationResult, payslip: Payslip): ReconciliationResult {
  const itemised = payslip.lines.length > 0;
  const comparisonBasis = itemised ? ComparisonBasis.ITEMISED_TIME_WORKED : ComparisonBasis.GROSS_PAY;
  const reported = itemised
    ? payslipCategoryTotal(payslip, PayslipLineCategory.HOURS_WORKED).add(
        payslipCategoryTotal(payslip, PayslipLineCategory.OVERTIME),
      )
    : payslip.grossPay;
  const tolerance = roundingTolerance(calculation);
  const notes = comparisonNotes(payslip, itemised);

  const periodMismatch =
    payslip.payPeriod.startDate.toString() !== calculation.payPeriod.startDate ||
    payslip.payPeriod.endDate.toString() !== calculation.payPeriod.endDate;

  const issueFindings = calculation.issues
    .map((calculationIssue, issueIndex) => ({ calculationIssue, issueIndex }))
    .filter(({ calculationIssue }) => isBlocking(calculationIssue))
    .map(({ calculationIssue, issueIndex }, n) => findingForIssue(calculationIssue, n + 1, issueIndex));
  const period = periodMismatch
    ? mismatchFinding(calculation, payslip, reported)
    : periodFinding(calculation, reported, tolerance, comparisonBasis);

  return {
    status: period.status,
    comparisonBasis,
    expectedAmount: period.expectedAmount,
    reportedAmount: reported.toString(),
    difference: period.difference,
    roundingTolerance: tolerance.toString(),
    findings: [period, ...issueFindings],
    notes,
  };
}

function periodFinding(
  calculation: PayPeriodCalculationResult,
  reported: Money,
  tolerance: Money,
  basis: ComparisonBasis,
): AuditFinding {
  const base = {
    id: "F000",
    scope: "PAY_PERIOD" as const,
    shiftIds: [],
    ruleIds: calculation.lines.map((l) => l.ruleId),
    clauseRefs: [...new Set(calculation.lines.flatMap((l) => l.clauseRefs))],
    evidenceRefs: ["/totals", "/lines", "/metadata"],
    reportedAmount: reported.toString(),
  };
  const expected = Money.of(calculation.totals.amount);
  const difference = reported.subtract(expected);

  if (
    calculation.status === CalculationStatus.UNSUPPORTED_SCENARIO ||
    calculation.status === CalculationStatus.INCOMPLETE_DATA
  ) {
    const unsupported = calculation.status === CalculationStatus.UNSUPPORTED_SCENARIO;
    return {
      ...base,
      status: unsupported ? FindingStatus.UNSUPPORTED_SCENARIO : FindingStatus.INCOMPLETE_DATA,
      title: unsupported ? "Pay period not supported" : "More information needed",
      explanation: unsupported
        ? "This pay period falls outside what WageGuard can calculate, so no expected amount was produced."
        : "Required information is missing, so no expected amount was produced.",
      expectedAmount: null,
      difference: null,
      evidenceRefs: ["/issues"],
      verificationStatus: "NOT_CALCULATED",
      nextStep: firstNextStep(
        calculation.issues,
        unsupported ? IssueSeverity.UNSUPPORTED : IssueSeverity.INCOMPLETE_DATA,
      ),
    };
  }

  if (calculation.status === CalculationStatus.REVIEW_REQUIRED) {
    const belowLowerBound = difference.isNegative() && difference.abs().compare(tolerance) > 0;
    return {
      ...base,
      status: belowLowerBound ? FindingStatus.POTENTIAL_UNDERPAYMENT : FindingStatus.REVIEW_REQUIRED,
      title: belowLowerBound
        ? "Paid less than the minimum for the shifts WageGuard could check"
        : "Some shifts need review",
      explanation: belowLowerBound
        ? `WageGuard priced ${calculation.totals.pricedMinutes} of ${calculation.totals.paidMinutes} paid minutes at ${expected.toString()}. ` +
          `Reported pay of ${reported.toString()} is already below that partial minimum, before the remaining ` +
          `${calculation.totals.unpricedMinutes} minutes are counted.`
        : `WageGuard priced ${calculation.totals.pricedMinutes} of ${calculation.totals.paidMinutes} paid minutes at ${expected.toString()}. ` +
          `The remaining ${calculation.totals.unpricedMinutes} minutes may attract entitlements WageGuard does not calculate, so the full minimum is unknown.`,
      expectedAmount: expected.toString(),
      difference: difference.toString(),
      evidenceRefs: [...base.evidenceRefs, "/issues"],
      verificationStatus: "RULES_TRANSCRIBED_HUMAN_REVIEW_PENDING",
      nextStep: belowLowerBound
        ? "Ask your employer how this pay was calculated, then use the Fair Work Pay Calculator or contact the Fair Work Ombudsman."
        : firstNextStep(calculation.issues, IssueSeverity.REVIEW_REQUIRED),
    };
  }

  const withinTolerance = difference.abs().compare(tolerance) <= 0;
  if (withinTolerance) {
    return {
      ...base,
      status: FindingStatus.MATCHED,
      title: "Reported pay matches the calculated award minimum",
      explanation: difference.isZero()
        ? `Reported pay equals the calculated minimum of ${expected.toString()}.`
        : `Reported pay differs by ${difference.toString()}, within the rounding tolerance of ${tolerance.toString()}.`,
      expectedAmount: expected.toString(),
      difference: difference.toString(),
      verificationStatus: "RULES_TRANSCRIBED_HUMAN_REVIEW_PENDING",
      nextStep: "No action indicated for the hours and rates WageGuard checked.",
    };
  }
  if (difference.isNegative()) {
    return {
      ...base,
      status: FindingStatus.POTENTIAL_UNDERPAYMENT,
      title: "Reported pay is below the calculated award minimum",
      explanation: `Reported pay of ${reported.toString()} is ${difference.abs().toString()} below the calculated minimum of ${expected.toString()}.`,
      expectedAmount: expected.toString(),
      difference: difference.toString(),
      verificationStatus: "RULES_TRANSCRIBED_HUMAN_REVIEW_PENDING",
      nextStep:
        "Check your hours and payslip entries, then raise the difference with your employer. The Fair Work Ombudsman can help if it is not resolved.",
    };
  }
  return {
    ...base,
    status: FindingStatus.POTENTIAL_OVERPAYMENT,
    title: "Reported pay is above the calculated award minimum",
    explanation:
      `Reported pay of ${reported.toString()} is ${difference.toString()} above the calculated minimum of ${expected.toString()}. ` +
      (basis === ComparisonBasis.GROSS_PAY
        ? "Gross pay may include allowances or leave that WageGuard does not calculate."
        : "Paying above the award minimum is lawful; this is not necessarily an error."),
    expectedAmount: expected.toString(),
    difference: difference.toString(),
    verificationStatus: "RULES_TRANSCRIBED_HUMAN_REVIEW_PENDING",
    nextStep:
      "No underpayment indicated. If you expected less, check the payslip entries for transcription errors.",
  };
}

function mismatchFinding(
  calculation: PayPeriodCalculationResult,
  payslip: Payslip,
  reported: Money,
): AuditFinding {
  return {
    id: "F000",
    scope: "PAY_PERIOD",
    status: FindingStatus.INCOMPLETE_DATA,
    title: "Payslip and timesheet cover different pay periods",
    explanation: `The payslip covers ${payslip.payPeriod.startDate.toString()} to ${payslip.payPeriod.endDate.toString()}, but the calculation covers ${calculation.payPeriod.startDate} to ${calculation.payPeriod.endDate}.`,
    expectedAmount: null,
    reportedAmount: reported.toString(),
    difference: null,
    shiftIds: [],
    ruleIds: [],
    clauseRefs: [],
    evidenceRefs: ["/payPeriod"],
    verificationStatus: "NOT_CALCULATED",
    nextStep: "Make sure the payslip and the shifts are for the same pay period.",
  };
}

const SEVERITY_TO_FINDING: Readonly<Record<Exclude<IssueSeverity, "WARNING">, FindingStatus>> = {
  UNSUPPORTED: FindingStatus.UNSUPPORTED_SCENARIO,
  INCOMPLETE_DATA: FindingStatus.INCOMPLETE_DATA,
  REVIEW_REQUIRED: FindingStatus.REVIEW_REQUIRED,
};

function findingForIssue(
  calculationIssue: CalculationIssue,
  index: number,
  issueIndex: number,
): AuditFinding {
  const severity = calculationIssue.severity as Exclude<IssueSeverity, "WARNING">;
  return {
    id: `F${String(index).padStart(3, "0")}`,
    scope: calculationIssue.shiftIds.length > 0 ? "SHIFT" : "PAY_PERIOD",
    status: SEVERITY_TO_FINDING[severity],
    title: calculationIssue.code,
    explanation: calculationIssue.message,
    expectedAmount: null,
    reportedAmount: null,
    difference: null,
    shiftIds: calculationIssue.shiftIds,
    ruleIds: [],
    clauseRefs: calculationIssue.clauseRefs,
    evidenceRefs: [`/issues/${issueIndex}`],
    verificationStatus: "NOT_CALCULATED",
    nextStep: calculationIssue.nextStep,
  };
}

function roundingTolerance(calculation: PayPeriodCalculationResult): Money {
  const groups = calculation.shifts
    .filter((s) => s.priced)
    .reduce((count, s) => {
      const ruleIds = new Set(
        s.segments.flatMap((seg) => (seg.classification.kind === "RULE" ? [seg.classification.ruleId] : [])),
      );
      return count + ruleIds.size;
    }, 0);
  return Money.fromDecimal(CENT.times(Math.max(1, groups)), RoundingMode.HALF_UP);
}

function comparisonNotes(payslip: Payslip, itemised: boolean): string[] {
  if (!itemised) {
    return [
      "Compared against gross pay because no itemised lines were entered. Gross pay may include allowances or leave.",
    ];
  }
  const excluded = [PayslipLineCategory.ALLOWANCE, PayslipLineCategory.LEAVE, PayslipLineCategory.OTHER]
    .map((category) => ({ category, total: payslipCategoryTotal(payslip, category) }))
    .filter(({ total }) => !total.isZero())
    .map(
      ({ category, total }) =>
        `${category} lines totalling ${total.toString()} were excluded from the comparison.`,
    );
  return ["Compared against payslip lines for time worked (hours worked and overtime).", ...excluded];
}

function firstNextStep(issues: readonly CalculationIssue[], severity: IssueSeverity): string {
  return issues.find((i) => i.severity === severity)?.nextStep ?? "Review the issues listed for this audit.";
}
