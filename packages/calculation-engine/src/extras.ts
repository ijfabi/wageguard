import type { Allowance, AwardRuleSet } from "@wageguard/award-rules";
import { Decimal, Money, type EmploymentTerms, type LocalDate } from "@wageguard/domain";

import type { LeaveKind, ParsedAllowanceClaims } from "./input.js";
import { issue, type CalculationIssue } from "./issues.js";
import { minutesToHours, type RatePricer } from "./pricing.js";
import type { PayLine } from "./result.js";

const MINUTES_PER_HOUR = 60;

/** What the allowances are counted from, after pricing decided which shifts count. */
export interface AllowanceFacts {
  /** Distinct Monday-to-Sunday weeks containing a priced shift. */
  readonly weeksWorked: number;
  readonly shiftsWorked: number;
  readonly paidMinutes: number;
  /** Local date -> overtime minutes worked that day (priced shifts only). */
  readonly overtimeMinutesByDate: ReadonlyMap<string, number>;
  readonly shiftIds: readonly string[];
}

/** cl. 19: allowances the employment declarations and the period's claims make payable. */
export function allowanceLines(
  ruleSet: AwardRuleSet,
  employment: EmploymentTerms,
  claims: ParsedAllowanceClaims,
  facts: AllowanceFacts,
  pricer: RatePricer,
): PayLine[] {
  const declared = employment.allowances;
  const overtimeDays = (minimum: number) =>
    [...claims.mealAllowanceDates].filter((date) => (facts.overtimeMinutesByDate.get(date) ?? 0) > minimum)
      .length;

  const quantityFor = (allowance: Allowance): Decimal => {
    switch (allowance.basis) {
      case "LAUNDRY_WEEKS":
        return new Decimal(declared.laundersSpecialClothing ? facts.weeksWorked : 0);
      case "LAUNDRY_SHIFTS":
        return new Decimal(declared.laundersSpecialClothing ? facts.shiftsWorked : 0);
      case "FIRST_AID_WEEKS":
        return new Decimal(declared.appointedFirstAider ? facts.weeksWorked : 0);
      case "LIQUOR_LICENCE_WEEKS":
        return new Decimal(declared.holdsLiquorLicence ? facts.weeksWorked : 0);
      case "COLD_WORK_HOURS":
        return new Decimal(claims.coldWorkMinutes).dividedBy(MINUTES_PER_HOUR);
      case "BELOW_ZERO_HOURS":
        return new Decimal(claims.belowZeroMinutes).dividedBy(MINUTES_PER_HOUR);
      case "BROKEN_HILL_HOURS":
        return new Decimal(declared.brokenHill ? facts.paidMinutes : 0).dividedBy(MINUTES_PER_HOUR);
      case "VEHICLE_KILOMETRES":
        return claims.vehicleKilometres;
      case "MEAL_OVERTIME_OVER_1H":
        return new Decimal(overtimeDays(60));
      case "MEAL_OVERTIME_OVER_4H":
        return new Decimal(overtimeDays(240));
    }
  };

  return (ruleSet.allowances ?? [])
    .filter((a) => a.employmentTypes.includes(employment.employmentType))
    .flatMap((allowance) => {
      const quantity = quantityFor(allowance);
      if (quantity.isZero()) {
        return [];
      }
      const unitAmount = Money.of(allowance.amount);
      const unit = UNITS[allowance.unit];
      const byTime = allowance.unit === "PER_HOUR";
      return [
        {
          ruleId: allowance.code,
          category: "ALLOWANCE",
          description: allowance.description,
          percentOfMinimumHourlyRate: "0",
          baseHourlyRate: "0.00",
          hourlyRate: unitAmount.toString(),
          minutes: 0,
          hours: byTime ? quantity.toDecimalPlaces(4).toString() : "0",
          amount: pricer.quantityAmount(unitAmount, quantity).toString(),
          clauseRefs: allowance.sources.map((s) => s.clause),
          shiftIds: allowance.basis === "VEHICLE_KILOMETRES" ? [] : facts.shiftIds,
          unit,
          quantity: byTime ? quantity.toDecimalPlaces(4).toString() : quantity.toString(),
        },
      ];
    });
}

const UNITS = {
  PER_WEEK: "WEEK",
  PER_SHIFT: "SHIFT",
  PER_HOUR: "HOUR",
  PER_KILOMETRE: "KILOMETRE",
  PER_OCCASION: "OCCASION",
} as const;

const LEAVE: Record<LeaveKind, { readonly description: string; readonly clauseRefs: readonly string[] }> = {
  ANNUAL: { description: "Annual leave", clauseRefs: ["28.1", "FW Act s 90"] },
  PERSONAL_CARERS: { description: "Personal/carer's leave", clauseRefs: ["29.1", "FW Act s 99"] },
  COMPASSIONATE: { description: "Compassionate leave", clauseRefs: ["29.1", "FW Act s 106"] },
  PUBLIC_HOLIDAY_NOT_WORKED: {
    description: "Public holiday not worked (ordinary hours)",
    clauseRefs: ["33.1", "FW Act s 116"],
  },
};

/**
 * Paid leave in the period, at the base rate (the minimum hourly rate, junior if applicable, on the
 * first day of the period), plus the 17.5% minimum annual leave loading (cl. 28.3).
 */
export function leaveLines(
  ruleSet: AwardRuleSet,
  employment: EmploymentTerms,
  leave: readonly { readonly kind: LeaveKind; readonly minutes: number }[],
  periodStart: LocalDate,
  pricer: RatePricer,
): { lines: PayLine[]; issues: CalculationIssue[] } {
  const policy = ruleSet.leave;
  if (leave.length === 0 || policy === undefined) {
    return { lines: [], issues: [] };
  }
  if (!policy.paidLeaveEmploymentTypes.includes(employment.employmentType)) {
    return {
      lines: [],
      issues: [
        issue(
          "CASUAL_PAID_LEAVE_NOT_APPLICABLE",
          "Paid leave was entered for a casual employee and was not priced.",
          {
            clauseRefs: ["11.1", "28.1"],
          },
        ),
      ],
    };
  }
  const base = pricer.baseOn(periodStart);
  const minutesByKind = new Map<LeaveKind, number>();
  for (const entry of leave) {
    minutesByKind.set(entry.kind, (minutesByKind.get(entry.kind) ?? 0) + entry.minutes);
  }
  const lines: PayLine[] = [];
  const line = (
    ruleId: string,
    description: string,
    rate: Money,
    minutes: number,
    category: string,
    clauseRefs: readonly string[],
    percent: string,
  ): PayLine => ({
    ruleId,
    category,
    description,
    percentOfMinimumHourlyRate: percent,
    baseHourlyRate: base.rate.toString(),
    hourlyRate: rate.toString(),
    minutes,
    hours: minutesToHours(minutes),
    amount: pricer.amount(rate, minutes).toString(),
    clauseRefs,
    shiftIds: [],
    unit: "HOUR",
    quantity: minutesToHours(minutes),
  });
  for (const kind of ["ANNUAL", "PERSONAL_CARERS", "COMPASSIONATE", "PUBLIC_HOLIDAY_NOT_WORKED"] as const) {
    const minutes = minutesByKind.get(kind);
    if (minutes === undefined) {
      continue;
    }
    const { description, clauseRefs } = LEAVE[kind];
    lines.push(
      line(`${ruleSet.awardCode}.LEAVE.${kind}`, description, base.rate, minutes, "LEAVE", clauseRefs, "100"),
    );
    if (kind === "ANNUAL") {
      lines.push(
        line(
          `${ruleSet.awardCode}.LEAVE.ANNUAL_LOADING`,
          `Annual leave loading (${policy.annualLeaveLoadingPercent}% minimum)`,
          pricer.percentOf(base, policy.annualLeaveLoadingPercent),
          minutes,
          "LEAVE_LOADING",
          policy.sources.map((s) => s.clause),
          policy.annualLeaveLoadingPercent,
        ),
      );
    }
  }
  const issues = minutesByKind.has("ANNUAL")
    ? [
        issue("ANNUAL_LEAVE_LOADING_MINIMUM", "Annual leave loading is shown at its 17.5% minimum.", {
          clauseRefs: ["28.3"],
        }),
      ]
    : [];
  return { lines, issues };
}
