import {
  LocalDate,
  Money,
  PayPeriod,
  PayslipLineCategory,
  createPayslip,
  type Payslip,
  type PayslipLine,
} from "@wageguard/domain";
import { describe, expect, it } from "vitest";

import { ComparisonBasis, FindingStatus, reconcile } from "../src/index.js";
import { FORTNIGHT, calc, casual, input, shift } from "./helpers.js";

const period = PayPeriod.of(LocalDate.parse(FORTNIGHT.startDate), LocalDate.parse(FORTNIGHT.endDate));
const grossOnly = (gross: string): Payslip =>
  createPayslip({ payPeriod: period, grossPay: Money.of(gross), lines: [] });
const itemised = (...lines: [PayslipLine["category"], string][]): Payslip => {
  const payslipLines = lines.map(([category, amount]) => ({
    category,
    description: category,
    amount: Money.of(amount),
  }));
  return createPayslip({
    payPeriod: period,
    grossPay: Money.sum(payslipLines.map((l) => l.amount)),
    lines: payslipLines,
  });
};

// 260.70 (Mon, 1 group) + 333.76 (Sat, 1 group) = 594.46; tolerance 0.02
const complete = calc(
  input(casual(), [
    shift("mon", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"]),
    shift("sat", "2026-07-11T08:00", "2026-07-11T16:30", ["2026-07-11T12:00", "2026-07-11T12:30"]),
  ]),
);
// Monday priced at 260.70; Tuesday 19:00-22:00 needs review.
const partial = calc(
  input(casual(), [
    shift("mon", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"]),
    shift("tue", "2026-07-07T19:00", "2026-07-07T22:00"),
  ]),
);

describe("reconcile: complete calculations", () => {
  it("MATCHED when reported equals expected", () => {
    const result = reconcile(complete, grossOnly("594.46"));
    expect(result).toMatchObject({
      status: FindingStatus.MATCHED,
      expectedAmount: "594.46",
      reportedAmount: "594.46",
      difference: "0.00",
      roundingTolerance: "0.02",
      comparisonBasis: ComparisonBasis.GROSS_PAY,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verificationStatus).toBe("RULES_TRANSCRIBED_HUMAN_REVIEW_PENDING");
  });

  it("MATCHED within the rounding tolerance, POTENTIAL_UNDERPAYMENT just beyond it", () => {
    expect(reconcile(complete, grossOnly("594.44")).status).toBe(FindingStatus.MATCHED);
    expect(reconcile(complete, grossOnly("594.48")).status).toBe(FindingStatus.MATCHED);
    const under = reconcile(complete, grossOnly("594.43"));
    expect(under.status).toBe(FindingStatus.POTENTIAL_UNDERPAYMENT);
    expect(under.difference).toBe("-0.03");
  });

  it("reports a material underpayment with an actionable next step", () => {
    const result = reconcile(complete, grossOnly("500.00"));
    expect(result.findings[0]).toMatchObject({
      status: FindingStatus.POTENTIAL_UNDERPAYMENT,
      expectedAmount: "594.46",
      reportedAmount: "500.00",
      difference: "-94.46",
      ruleIds: ["MA000004.ORD.WEEKDAY", "MA000004.PEN.SATURDAY"],
    });
    expect(result.findings[0]?.nextStep).toMatch(/Fair Work Ombudsman/);
    expect(result.findings[0]?.clauseRefs).toContain("22.1");
  });

  it("explains an apparent overpayment differently for gross-only and itemised payslips", () => {
    expect(reconcile(complete, grossOnly("650.00")).findings[0]?.explanation).toMatch(/allowances or leave/);
    const result = reconcile(complete, itemised([PayslipLineCategory.HOURS_WORKED, "650.00"]));
    expect(result.status).toBe(FindingStatus.POTENTIAL_OVERPAYMENT);
    expect(result.findings[0]?.explanation).toMatch(/lawful/);
  });

  it("compares only time-worked lines when the payslip is itemised and notes what was excluded", () => {
    const result = reconcile(
      complete,
      itemised(
        [PayslipLineCategory.HOURS_WORKED, "594.46"],
        [PayslipLineCategory.ALLOWANCE, "20.00"],
        [PayslipLineCategory.LEAVE, "50.00"],
      ),
    );
    expect(result.status).toBe(FindingStatus.MATCHED);
    expect(result.comparisonBasis).toBe(ComparisonBasis.ITEMISED_TIME_WORKED);
    expect(result.notes).toEqual([
      "Compared against payslip lines for time worked (hours worked and overtime).",
      "ALLOWANCE lines totalling 20.00 were excluded from the comparison.",
      "LEAVE lines totalling 50.00 were excluded from the comparison.",
    ]);
  });

  it("includes overtime lines in the time-worked total", () => {
    const result = reconcile(
      complete,
      itemised([PayslipLineCategory.HOURS_WORKED, "500.00"], [PayslipLineCategory.OVERTIME, "94.46"]),
    );
    expect(result.status).toBe(FindingStatus.MATCHED);
  });
});

describe("reconcile: partial, unsupported and incomplete calculations", () => {
  it("treats the priced portion as a lower bound: below it is a potential underpayment", () => {
    const result = reconcile(partial, grossOnly("200.00"));
    expect(result.status).toBe(FindingStatus.POTENTIAL_UNDERPAYMENT);
    expect(result.findings[0]?.explanation).toMatch(/already below that partial minimum/);
  });

  it("is REVIEW_REQUIRED when reported pay is at or above the priced portion", () => {
    const result = reconcile(partial, grossOnly("400.00"));
    expect(result.status).toBe(FindingStatus.REVIEW_REQUIRED);
    expect(result.expectedAmount).toBe("260.70");
    const shiftFinding = result.findings.find((f) => f.scope === "SHIFT");
    expect(shiftFinding).toMatchObject({
      status: FindingStatus.REVIEW_REQUIRED,
      title: "OUTSIDE_SPAN_OF_ORDINARY_HOURS",
      shiftIds: ["tue"],
      evidenceRefs: ["/issues/0"],
      verificationStatus: "NOT_CALCULATED",
    });
  });

  it("produces no expected amount for unsupported scenarios", () => {
    const unsupported = calc(
      input(casual({ employmentType: "FULL_TIME" }), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]),
    );
    const result = reconcile(unsupported, grossOnly("100.00"));
    expect(result).toMatchObject({
      status: FindingStatus.UNSUPPORTED_SCENARIO,
      expectedAmount: null,
      difference: null,
    });
    expect(result.findings[0]?.nextStep).toMatch(/casual and part-time/);
    expect(result.findings[1]).toMatchObject({
      scope: "PAY_PERIOD",
      status: FindingStatus.UNSUPPORTED_SCENARIO,
    });
  });

  it("produces no expected amount for incomplete data", () => {
    const incomplete = calc(input(casual(), []));
    expect(reconcile(incomplete, grossOnly("0.00"))).toMatchObject({
      status: FindingStatus.INCOMPLETE_DATA,
      expectedAmount: null,
    });
  });

  it("flags a payslip for a different pay period", () => {
    const other = createPayslip({
      payPeriod: PayPeriod.of(LocalDate.parse("2026-07-20"), LocalDate.parse("2026-08-02")),
      grossPay: Money.of("594.46"),
      lines: [],
    });
    const result = reconcile(complete, other);
    expect(result.status).toBe(FindingStatus.INCOMPLETE_DATA);
    expect(result.findings[0]?.title).toMatch(/different pay periods/);
  });

  it("ignores warnings when creating findings", () => {
    const withWarning = calc(input(casual(), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]));
    expect(withWarning.issues.map((i) => i.severity)).toEqual(["WARNING"]);
    expect(reconcile(withWarning, grossOnly("278.08")).findings).toHaveLength(1);
  });
});
