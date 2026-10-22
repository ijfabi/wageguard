import type { PayPeriodCalculationInput, ShiftInput } from "@wageguard/calculation-engine";

/**
 * Golden correctness scenarios for MA000004 rule set 2026-07-01/r1.
 *
 * Every REFERENCE expectation was derived by hand from the dollar rates the award itself publishes
 * in Schedule B (B.1.1 for part-time, B.2.1 for casual employees), NOT from WageGuard's own output.
 * The derivation is recorded with each case so that a reviewer can check it against the source.
 *
 * Verification status is honest: these are SOURCE_DERIVED and have NOT been reviewed by a qualified
 * payroll or legal professional, nor cross-checked against the Fair Work Pay Calculator.
 */
export type GoldenKind = "REFERENCE" | "REJECTION";

export interface GoldenScenario {
  readonly id: string;
  readonly kind: GoldenKind;
  readonly title: string;
  readonly ruleSetVersion: "MA000004/2026-07-01/r1";
  readonly effectiveDate: string;
  readonly sources: readonly string[];
  readonly input: PayPeriodCalculationInput;
  readonly expected: {
    readonly status: string;
    readonly totalAmount?: string;
    readonly lines?: Readonly<Record<string, string>>;
    readonly issueCodes?: readonly string[];
  };
  readonly derivation: string;
  readonly verification: {
    readonly method: "SOURCE_DERIVED_FROM_SCHEDULE_B" | "SCOPE_RULE";
    readonly humanReview: "PENDING" | "REVIEWED";
  };
}

const FORTNIGHT = { startDate: "2026-07-06", endDate: "2026-07-19" } as const;
const EFFECTIVE = "2026-07-01";
const PENDING = { humanReview: "PENDING" } as const;

const casual = (
  overrides: Partial<PayPeriodCalculationInput["employment"]> = {},
): PayPeriodCalculationInput["employment"] => ({
  employmentId: "golden",
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
const partTime = (guaranteed: Record<string, number>) =>
  casual({ employmentType: "PART_TIME", partTimeGuaranteedMinutes: guaranteed });

const shift = (id: string, start: string, end: string, meal?: [string, string]): ShiftInput => ({
  id,
  start,
  end,
  breaks: meal === undefined ? [] : [{ kind: "UNPAID_MEAL", start: meal[0], end: meal[1] }],
});

const reference = (
  id: string,
  title: string,
  input: PayPeriodCalculationInput,
  lines: Record<string, string>,
  totalAmount: string,
  derivation: string,
  sources: readonly string[],
): GoldenScenario => ({
  id,
  kind: "REFERENCE",
  title,
  ruleSetVersion: "MA000004/2026-07-01/r1",
  effectiveDate: EFFECTIVE,
  sources,
  input,
  expected: { status: "CALCULATED", totalAmount, lines },
  derivation,
  verification: { method: "SOURCE_DERIVED_FROM_SCHEDULE_B", ...PENDING },
});

const rejection = (
  id: string,
  title: string,
  input: PayPeriodCalculationInput,
  status: string,
  issueCodes: readonly string[],
  derivation: string,
  sources: readonly string[],
): GoldenScenario => ({
  id,
  kind: "REJECTION",
  title,
  ruleSetVersion: "MA000004/2026-07-01/r1",
  effectiveDate: EFFECTIVE,
  sources,
  input,
  expected: { status, issueCodes },
  derivation,
  verification: { method: "SCOPE_RULE", ...PENDING },
});

const ORD = "MA000004.ORD.WEEKDAY";
const EVE = "MA000004.PEN.WEEKDAY_AFTER_6PM";
const SAT = "MA000004.PEN.SATURDAY";
const SUN = "MA000004.PEN.SUNDAY";
const B21 = "Schedule B.2.1 (casual adult, Level 1)";
const B11 = "Schedule B.1.1 (full-time/part-time adult, Level 1)";

export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  reference(
    "G001",
    "Casual, Monday ordinary hours with unpaid meal break",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"])],
    },
    { [ORD]: "260.70" },
    "260.70",
    "8h - 0.5h unpaid meal = 7.5h x $34.76 (B.2.1 ordinary hours) = $260.70",
    [B21, "cl. 15.1 Table 2", "cl. 16.2 Table 3"],
  ),
  reference(
    "G002",
    "Casual, Tuesday 6 pm to 9 pm",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T18:00", "2026-07-07T21:00")],
    },
    { [EVE]: "125.16" },
    "125.16",
    "3h x $41.72 (B.2.1 Monday to Friday after 6.00 pm) = $125.16",
    [B21, "cl. 22.1 Table 12"],
  ),
  reference(
    "G003",
    "Casual, Saturday with unpaid meal break",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-11T08:00", "2026-07-11T16:30", ["2026-07-11T12:00", "2026-07-11T12:30"])],
    },
    { [SAT]: "333.76" },
    "333.76",
    "8.5h - 0.5h = 8h x $41.72 (B.2.1 Saturday) = $333.76",
    [B21, "cl. 22.1 Table 12"],
  ),
  reference(
    "G004",
    "Casual, Sunday with half-cent rounding",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-12T10:00", "2026-07-12T16:00", ["2026-07-12T13:00", "2026-07-12T13:30"])],
    },
    { [SUN]: "267.69" },
    "267.69",
    "6h - 0.5h = 5.5h x $48.67 (B.2.1 Sunday) = $267.685, rounded half-up to $267.69",
    [B21, "cl. 22.1 Table 12"],
  ),
  reference(
    "G005",
    "Part-time, Monday shift crossing 6 pm",
    {
      employment: partTime({ MON: 330 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T14:00", "2026-07-06T20:00", ["2026-07-06T16:00", "2026-07-06T16:30"])],
    },
    { [ORD]: "97.34", [EVE]: "69.52" },
    "166.86",
    "Before 6 pm: 3.5h x $27.81 (B.1.1 ordinary) = $97.335 -> $97.34; after 6 pm: 2h x $34.76 (B.1.1 Mon-Fri after 6 pm) = $69.52; total $166.86",
    [B11, "cl. 22.1 Table 12", "cl. 10.5"],
  ),
  reference(
    "G006",
    "Part-time, Saturday",
    {
      employment: partTime({ SAT: 330 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-11T09:00", "2026-07-11T15:00", ["2026-07-11T12:00", "2026-07-11T12:30"])],
    },
    { [SAT]: "191.18" },
    "191.18",
    "5.5h x $34.76 (B.1.1 Saturday) = $191.18",
    [B11, "cl. 22.1 Table 12"],
  ),
  reference(
    "G007",
    "Part-time, Sunday",
    {
      employment: partTime({ SUN: 240 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-12T09:00", "2026-07-12T13:00")],
    },
    { [SUN]: "166.88" },
    "166.88",
    "4h x $41.72 (B.1.1 Sunday) = $166.88",
    [B11, "cl. 22.1 Table 12"],
  ),
  reference(
    "G008",
    "Part-time, Wednesday from the 7 am start of the span with a 60-minute meal break",
    {
      employment: partTime({ WED: 480 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-08T07:00", "2026-07-08T16:00", ["2026-07-08T11:30", "2026-07-08T12:30"])],
    },
    { [ORD]: "222.48" },
    "222.48",
    "9h - 1h unpaid meal = 8h x $27.81 (B.1.1 ordinary) = $222.48",
    [B11, "cl. 15.1 Table 2", "cl. 16.2 Table 3"],
  ),
  reference(
    "G009",
    "Casual fortnight: weekday, Saturday and Sunday shifts aggregated per rule",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [
        shift("mon", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"]),
        shift("sat", "2026-07-11T08:00", "2026-07-11T16:30", ["2026-07-11T12:00", "2026-07-11T12:30"]),
        shift("sun", "2026-07-12T10:00", "2026-07-12T16:00", ["2026-07-12T13:00", "2026-07-12T13:30"]),
      ],
    },
    { [ORD]: "260.70", [SAT]: "333.76", [SUN]: "267.69" },
    "862.15",
    "G001 $260.70 + G003 $333.76 + G004 $267.69 = $862.15",
    [B21],
  ),
  reference(
    "G010",
    "Casual, Friday 4 pm to 9 pm crossing the 6 pm boundary",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-10T16:00", "2026-07-10T21:00")],
    },
    { [ORD]: "69.52", [EVE]: "125.16" },
    "194.68",
    "2h x $34.76 = $69.52 plus 3h x $41.72 = $125.16; total $194.68",
    [B21, "cl. 22.1 Table 12"],
  ),
  rejection(
    "R001",
    "Work after 9 pm on a weekday is not calculated",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T19:00", "2026-07-06T22:00")],
    },
    "REVIEW_REQUIRED",
    ["OUTSIDE_SPAN_OF_ORDINARY_HOURS"],
    "9.00 pm to 10.00 pm is outside the Monday-Friday span (cl. 15.1 Table 2): overtime (cl. 21.2) or a cl. 15.2 exception may apply.",
    ["cl. 15.1", "cl. 15.2", "cl. 21.2"],
  ),
  rejection(
    "R002",
    "Sunday before 9 am is outside the span",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-12T07:00", "2026-07-12T12:00")],
    },
    "REVIEW_REQUIRED",
    ["OUTSIDE_SPAN_OF_ORDINARY_HOURS"],
    "The Sunday span starts at 9.00 am (cl. 15.1 Table 2).",
    ["cl. 15.1"],
  ),
  rejection(
    "R003",
    "Full-time employment is unsupported",
    {
      employment: casual({ employmentType: "FULL_TIME" }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["EMPLOYMENT_TYPE_NOT_SUPPORTED"],
    "MVP scope covers casual and part-time employment only.",
    ["supportedScope"],
  ),
  rejection(
    "R004",
    "Pay period before the verified rule set",
    {
      employment: casual(),
      payPeriod: { startDate: "2026-06-29", endDate: "2026-07-12" },
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["NO_RULE_SET_FOR_PERIOD"],
    "Rates apply from the first full pay period starting on or after 1 July 2026; this period started on 29 June 2026.",
    ["cl. 17.1 (ppc 01Jul26)"],
  ),
  rejection(
    "R005",
    "Declared public holiday is not calculated",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
      declaredPublicHolidays: ["2026-07-06"],
    },
    "REVIEW_REQUIRED",
    ["PUBLIC_HOLIDAY_NOT_SUPPORTED"],
    "The public holiday rule is transcribed but disabled: no verified holiday calendar.",
    ["cl. 22.1 Table 12", "cl. 32"],
  ),
  rejection(
    "R006",
    "Shift shorter than the minimum engagement",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T10:00", "2026-07-07T12:00")],
    },
    "REVIEW_REQUIRED",
    ["MINIMUM_ENGAGEMENT_SHORTFALL"],
    "Casual minimum daily engagement is 3 hours (cl. 11.2).",
    ["cl. 11.2"],
  ),
  rejection(
    "R007",
    "Junior employee is unsupported",
    {
      employment: casual({
        declarations: {
          awardCoverage: "CONFIRMED",
          enterpriseAgreement: "NONE",
          ageBand: "UNDER_21",
          shiftworker: "NO",
        },
      }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["JUNIOR_RATES_NOT_SUPPORTED"],
    "Junior rates (cl. 17.2) are not modelled.",
    ["cl. 17.2"],
  ),
  rejection(
    "R008",
    "Enterprise agreement applies",
    {
      employment: casual({
        declarations: {
          awardCoverage: "CONFIRMED",
          enterpriseAgreement: "APPLIES",
          ageBand: "ADULT_21_PLUS",
          shiftworker: "NO",
        },
      }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["ENTERPRISE_AGREEMENT_APPLIES"],
    "An enterprise agreement is not equivalent to the award.",
    ["Fair Work Act 2009"],
  ),
  rejection(
    "R009",
    "Shiftworker is unsupported",
    {
      employment: casual({
        declarations: {
          awardCoverage: "CONFIRMED",
          enterpriseAgreement: "NONE",
          ageBand: "ADULT_21_PLUS",
          shiftworker: "YES",
        },
      }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["SHIFTWORKER_NOT_SUPPORTED"],
    "Part 6 shiftwork rates (cl. 25) are not modelled.",
    ["cl. 23", "cl. 25"],
  ),
  rejection(
    "R010",
    "Part-time hours above guaranteed hours",
    {
      employment: partTime({ TUE: 240 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T09:00", "2026-07-07T15:00", ["2026-07-07T12:00", "2026-07-07T12:30"])],
    },
    "REVIEW_REQUIRED",
    ["PART_TIME_HOURS_EXCEED_GUARANTEED"],
    "330 paid minutes exceed 240 guaranteed minutes; the excess is overtime under cl. 10.8 unless varied in writing (cl. 10.6).",
    ["cl. 10.5", "cl. 10.6", "cl. 10.8"],
  ),
  rejection(
    "R011",
    "Casual working more than 9 hours in a day",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T07:00", "2026-07-07T17:30", ["2026-07-07T12:00", "2026-07-07T12:30"])],
    },
    "REVIEW_REQUIRED",
    ["DAILY_ORDINARY_HOURS_EXCEEDED"],
    "600 paid minutes exceed the 9-hour daily maximum of ordinary hours (cl. 15.4); casual overtime may apply (cl. 21.2).",
    ["cl. 15.4", "cl. 21.2"],
  ),
];
