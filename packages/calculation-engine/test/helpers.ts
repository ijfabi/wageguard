import {
  AwardRuleRegistry,
  AwardRuleSetSchema,
  BUNDLED_RULE_SETS,
  PUBLISHED_FINGERPRINTS,
  bundledRegistry,
  type AwardRuleSet,
} from "@wageguard/award-rules";
import { Instant } from "@wageguard/domain";

import {
  calculatePayPeriod,
  type CalculationContext,
  type EmploymentInput,
  type PayPeriodCalculationInput,
  type PayPeriodCalculationResult,
  type ShiftInput,
} from "../src/index.js";

export const CALCULATED_AT = Instant.parse("2026-10-22T00:00:00Z");
/** The bundled rule sets: r2 is in force for pay periods from 1 July 2026. */
export const context: CalculationContext = { rules: bundledRegistry(), calculatedAt: CALCULATED_AT };
/**
 * Only r1, as published. r1 flags overtime, public holidays, short engagements and short breaks for
 * review instead of pricing them; these tests keep that behaviour covered for audits made with it.
 */
export const r1Context: CalculationContext = {
  rules: AwardRuleRegistry.create([BUNDLED_RULE_SETS[0]], { publishedFingerprints: PUBLISHED_FINGERPRINTS }),
  calculatedAt: CALCULATED_AT,
};

export const casual = (overrides: Partial<EmploymentInput> = {}): EmploymentInput => ({
  employmentId: "emp-1",
  awardCode: "MA000004",
  classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
  employmentType: "CASUAL",
  timeZone: "Australia/Sydney",
  declarations: {
    awardCoverage: "CONFIRMED",
    enterpriseAgreement: "NONE",
    ageBand: "ADULT_21_PLUS",
    shiftworker: "NO",
  },
  ...overrides,
});

export const partTime = (
  guaranteed: EmploymentInput["partTimeGuaranteedMinutes"],
  overrides: Partial<EmploymentInput> = {},
) => casual({ employmentType: "PART_TIME", partTimeGuaranteedMinutes: guaranteed, ...overrides });

/** 2026-07-06 is a Monday; the fortnight runs Monday to Sunday. */
export const FORTNIGHT = { startDate: "2026-07-06", endDate: "2026-07-19" };

export const shift = (id: string, start: string, end: string, meal?: [string, string]): ShiftInput => ({
  id,
  start,
  end,
  breaks: meal === undefined ? [] : [{ kind: "UNPAID_MEAL", start: meal[0], end: meal[1] }],
});

export const input = (
  employment: EmploymentInput,
  shifts: ShiftInput[],
  extra: Partial<PayPeriodCalculationInput> = {},
): PayPeriodCalculationInput => ({ employment, payPeriod: FORTNIGHT, shifts, ...extra });

export const calc = (
  value: PayPeriodCalculationInput,
  ctx: CalculationContext = context,
): PayPeriodCalculationResult => calculatePayPeriod(value, ctx);

/**
 * TEST-ONLY rule sets derived from the published one. They exercise versioning and precedence
 * mechanics; their values are NOT award rates.
 */
export const draftRuleSet = (mutate: (r: AwardRuleSet) => void): AwardRuleSet => {
  const ruleSet = structuredClone(AwardRuleSetSchema.parse(BUNDLED_RULE_SETS[0]));
  mutate(ruleSet);
  return ruleSet;
};
export const draftContext = (...sets: AwardRuleSet[]): CalculationContext => ({
  rules: AwardRuleRegistry.create(sets, { publishedFingerprints: {}, allowUnpublished: true }),
  calculatedAt: CALCULATED_AT,
});
