import type { PayPeriodCalculationInput, ShiftInput } from "@wageguard/calculation-engine";

/**
 * Golden correctness scenarios for MA000004 rule set 2026-07-01/r2 (r2 has the same rates as r1 and
 * also prices overtime, public holidays, minimum engagement, the break between work days, juniors,
 * shiftwork, allowances and leave).
 *
 * Every REFERENCE expectation was derived by hand from the dollar rates the award itself publishes
 * in Schedule B (B.1 full-time and part-time, B.2 casual, B.3 junior), NOT from WageGuard's own output.
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
  readonly ruleSetVersion: "MA000004/2026-07-01/r2";
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
  ruleSetVersion: "MA000004/2026-07-01/r2",
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
  ruleSetVersion: "MA000004/2026-07-01/r2",
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
const PH = "MA000004.PH.ALL_ORDINARY";
const OT1 = "MA000004.OT.MON_SAT_FIRST_3H";
const OTSUN = "MA000004.OT.SUNDAY";
const SHIFT = "MA000004.SHIFT.MON_FRI";
const BREAK = "MA000004.BREAK.LESS_THAN_12_HOURS";
const TOPUP = "MA000004.TOPUP.MINIMUM_ENGAGEMENT";
const LEAVE = "MA000004.LEAVE.ANNUAL";
const LOADING = "MA000004.LEAVE.ANNUAL_LOADING";
const WEEK = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];
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
  reference(
    "G011",
    "Casual, weekday work after 9 pm is overtime outside the span",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T19:00", "2026-07-06T22:00")],
    },
    { [EVE]: "83.44", [OT1]: "48.67" },
    "132.11",
    "19:00-21:00 2h x $41.72 (B.2.1 after 6 pm) = $83.44; 21:00-22:00 is outside the span (Table 2), so overtime, first 3 hours Monday to Saturday: 1h x $48.67 (casual 175%, Table 11) = $48.67",
    [B21, "cl. 15.1 Table 2", "cl. 21.2 Table 10 and Table 11"],
  ),
  reference(
    "G012",
    "Casual, Sunday before 9 am is overtime",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-12T07:00", "2026-07-12T12:00")],
    },
    { [SUN]: "146.01", [OTSUN]: "125.14" },
    "271.15",
    "07:00-09:00 is before the Sunday span: Sunday overtime 2h x $62.57 (casual 225%) = $125.14; 09:00-12:00 3h x $48.67 = $146.01",
    [B21, "cl. 15.1 Table 2", "cl. 21.2 Table 11"],
  ),
  reference(
    "G013",
    "Full-time Level 3, 40 hours in a week",
    {
      employment: casual({ employmentType: "FULL_TIME", classificationCode: "RETAIL_EMPLOYEE_LEVEL_3" }),
      payPeriod: FORTNIGHT,
      shifts: WEEK.map((d) => shift(d, `${d}T08:00`, `${d}T16:30`, [`${d}T12:00`, `${d}T12:30`])),
    },
    { [ORD]: "1097.82", [OT1]: "86.68" },
    "1184.50",
    "8h a day, Mon-Fri = 40h. The hours beyond 38 are the last 2h on Friday, first-tier overtime at $43.34 (B.1.3 Level 3) = $86.68; 38h x $28.89 (B.1.1 Level 3) = $1,097.82",
    [B11, "B.1.3", "cl. 21.2 Table 10"],
  ),
  reference(
    "G014",
    "Casual, declared public holiday",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
      declaredPublicHolidays: ["2026-07-06"],
    },
    { [PH]: "278.12" },
    "278.12",
    "4h x $69.53 (B.2.1 public holiday, casual 250%) = $278.12",
    [B21, "cl. 22.1 Table 12", "cl. 33.3"],
  ),
  reference(
    "G015",
    "Casual, short shift topped up to the 3-hour minimum engagement",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T10:00", "2026-07-07T12:00")],
    },
    { [ORD]: "69.52", [TOPUP]: "34.76" },
    "104.28",
    "2h worked x $34.76 = $69.52, plus 1h to reach the 3-hour minimum engagement at the same rate = $34.76",
    [B21, "cl. 11.2"],
  ),
  reference(
    "G016",
    "Casual junior, 17 years old",
    {
      employment: casual({
        dateOfBirth: "2009-03-15",
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
    { [ORD]: "83.44" },
    "83.44",
    "17-year-old Level 1 junior rate $16.69 (B.3.1); casual 125% = $20.86 (B.3.4); 4h = $83.44",
    ["B.3.1", "B.3.4", "cl. 17.2 Table 5"],
  ),
  reference(
    "G017",
    "Casual shiftworker, night shift",
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
      shifts: [shift("n1", "2026-07-07T22:00", "2026-07-08T06:00")],
    },
    { [SHIFT]: "344.88" },
    "344.88",
    "Starts after 6 pm, so shiftwork (cl. 24.1). 8h x $43.11 (B.2.2 Monday to Friday, casual 155%) = $344.88",
    ["B.2.2", "cl. 24.1", "cl. 25.1"],
  ),
  reference(
    "G018",
    "Part-time, hours above the guaranteed hours are overtime",
    {
      employment: partTime({ TUE: 240 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T09:00", "2026-07-07T15:00", ["2026-07-07T12:00", "2026-07-07T12:30"])],
    },
    { [ORD]: "111.24", [OT1]: "62.58" },
    "173.82",
    "330 paid minutes against 240 guaranteed: 4h x $27.81 = $111.24; the last 1.5h are overtime (cl. 10.8) at $41.72 (B.1.3 first 3 hours) = $62.58",
    [B11, "B.1.3", "cl. 10.8"],
  ),
  reference(
    "G019",
    "Casual, a 10-hour day is the week's one longer day (cl. 15.5)",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T07:00", "2026-07-07T17:30", ["2026-07-07T12:00", "2026-07-07T12:30"])],
    },
    { [ORD]: "347.60" },
    "347.60",
    "10h paid, within the 11 ordinary hours allowed on one day a week: 10h x $34.76 = $347.60",
    [B21, "cl. 15.5", "cl. 21.2 Table 10"],
  ),
  reference(
    "G020",
    "Casual, two long days in one week",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [
        shift("tue", "2026-07-07T07:00", "2026-07-07T18:00", ["2026-07-07T12:00", "2026-07-07T12:30"]),
        shift("wed", "2026-07-08T07:00", "2026-07-08T18:00", ["2026-07-08T12:00", "2026-07-08T12:30"]),
      ],
    },
    { [ORD]: "677.82", [OT1]: "73.01" },
    "750.83",
    "10.5h each day. Tuesday is the week's 11-hour day; Wednesday's last 1.5h are beyond 9 hours: 1.5h x $48.67 = $73.005 -> $73.01. Ordinary 19.5h x $34.76 = $677.82",
    [B21, "cl. 15.4", "cl. 15.5", "cl. 21.2"],
  ),
  reference(
    "G021",
    "Casual, less than 12 hours between work days",
    {
      employment: casual(),
      payPeriod: FORTNIGHT,
      shifts: [
        shift("mon", "2026-07-06T12:00", "2026-07-06T21:00", ["2026-07-06T16:00", "2026-07-06T16:30"]),
        shift("tue", "2026-07-07T07:00", "2026-07-07T12:00"),
      ],
    },
    { [ORD]: "191.18", [EVE]: "125.16", [BREAK]: "312.85" },
    "629.19",
    "Monday 5.5h x $34.76 = $191.18 + 3h x $41.72 = $125.16. Tuesday starts 10h later: 5h at 225% ($62.57: cl. 16.6(b) 200% plus the cl. 11.1 casual loading) = $312.85",
    [B21, "cl. 16.6", "cl. 11.1"],
  ),
  reference(
    "G022",
    "Part-time, annual leave with the 17.5% loading",
    {
      employment: partTime({ TUE: 240 }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")],
      leave: [{ kind: "ANNUAL", minutes: 456 }],
    },
    { [ORD]: "111.24", [LEAVE]: "211.36", [LOADING]: "37.01" },
    "359.61",
    "4h x $27.81 = $111.24; 7.6h leave x $27.81 = $211.356 -> $211.36; loading $27.81 x 17.5% = $4.87 x 7.6h = $37.012 -> $37.01",
    [B11, "cl. 28.3"],
  ),
  reference(
    "G023",
    "Casual, laundry and first aid allowances",
    {
      employment: casual({
        allowances: {
          laundersSpecialClothing: true,
          appointedFirstAider: true,
          holdsLiquorLicence: false,
          brokenHill: false,
        },
      }),
      payPeriod: FORTNIGHT,
      shifts: [
        shift("a", "2026-07-06T09:00", "2026-07-06T13:00"),
        shift("b", "2026-07-13T09:00", "2026-07-13T13:00"),
      ],
    },
    { [ORD]: "278.08", "MA000004.ALW.LAUNDRY_PER_SHIFT": "2.56", "MA000004.ALW.FIRST_AID": "29.10" },
    "309.74",
    "8h x $34.76 = $278.08; laundry 2 shifts x $1.28 = $2.56 (cl. 19.3(c)); first aid 2 weeks x $14.55 = $29.10 (cl. 19.10)",
    [B21, "cl. 19.3", "cl. 19.10"],
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
    "R012",
    "Baking production shiftworker is unsupported",
    {
      employment: casual({
        bakingProduction: true,
        declarations: {
          awardCoverage: "CONFIRMED",
          enterpriseAgreement: "NONE",
          ageBand: "ADULT_21_PLUS",
          shiftworker: "YES",
        },
      }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-07T03:00", "2026-07-07T09:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["BAKING_PRODUCTION_NOT_SUPPORTED"],
    "Baking production shift rates (cl. 24.2, 25.2) are not modelled.",
    ["cl. 24.2", "cl. 25.2"],
  ),
  rejection(
    "R013",
    "Week over 38 hours under an averaging roster",
    {
      employment: casual({ averagingRoster: true }),
      payPeriod: FORTNIGHT,
      shifts: WEEK.map((d) => shift(d, `${d}T09:00`, `${d}T17:30`, [`${d}T12:00`, `${d}T12:30`])),
    },
    "REVIEW_REQUIRED",
    ["AVERAGING_ROSTER_WEEKLY_HOURS"],
    "40 hours in one week may be ordinary hours if the roster averages 38 over its cycle (cl. 15.6(g)); the cycle isn't known.",
    ["cl. 15.6(g)", "cl. 21.2 Table 10"],
  ),
  rejection(
    "R014",
    "Junior without a date of birth",
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
    "INCOMPLETE_DATA",
    ["DATE_OF_BIRTH_MISSING"],
    "Junior rates depend on age on each day worked (cl. 17.2), so a date of birth is needed.",
    ["cl. 17.2"],
  ),
  rejection(
    "R015",
    "Classification the award doesn't have",
    {
      employment: casual({ classificationCode: "RETAIL_EMPLOYEE_LEVEL_9" }),
      payPeriod: FORTNIGHT,
      shifts: [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")],
    },
    "UNSUPPORTED_SCENARIO",
    ["CLASSIFICATION_NOT_SUPPORTED"],
    "Table 4 has Retail Employee Levels 1 to 8 only.",
    ["cl. 17.1 Table 4"],
  ),
];
