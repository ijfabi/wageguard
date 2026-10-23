import type { AuditDetail } from "@wageguard/api-contracts";

import { formatAud, formatDifference, toCents } from "./money.js";

export interface AmountPresentation {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

type AmountFields = Pick<
  AuditDetail,
  | "calculationStatus"
  | "comparisonBasis"
  | "reportedAmount"
  | "expectedAmount"
  | "difference"
  | "roundingTolerance"
>;

/**
 * The three headline amounts of an audit (reported, calculated, difference), worded identically in
 * the web app and the PDF report. For partial calculations the expected amount covers only the
 * priced shifts, and unpriced time can only add to the minimum: a negative difference is still a
 * potential underpayment, but a positive one is not evidence of overpayment.
 */
export function auditAmounts(
  audit: AmountFields,
): readonly [AmountPresentation, AmountPresentation, AmountPresentation] {
  const complete = audit.calculationStatus === "CALCULATED";
  let differenceDetail: string;
  if (audit.difference === null) {
    differenceDetail = "No comparison was possible";
  } else if (complete) {
    differenceDetail = `Rounding tolerance ${formatAud(audit.roundingTolerance)}`;
  } else if (toCents(audit.difference) < 0n) {
    differenceDetail = "Paid less than the minimum for the checked shifts alone";
  } else {
    differenceDetail = "Not a verified overpayment: some hours were not priced";
  }
  return [
    {
      label: "Reported pay",
      value: formatAud(audit.reportedAmount),
      detail:
        audit.comparisonBasis === "GROSS_PAY"
          ? "Gross pay from your payslip"
          : "Payslip lines for time worked",
    },
    {
      label: "Calculated award minimum",
      value: audit.expectedAmount === null ? "Not calculated" : formatAud(audit.expectedAmount),
      detail: complete ? "All paid time priced" : "Only the shifts WageGuard could check",
    },
    {
      label: complete ? "Difference" : "Difference vs checked shifts",
      value: audit.difference === null ? "—" : formatDifference(audit.difference),
      detail: differenceDetail,
    },
  ];
}
