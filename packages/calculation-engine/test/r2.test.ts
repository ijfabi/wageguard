import { describe, expect, it } from "vitest";

import { CalculationStatus, isBlocking, type PayPeriodCalculationResult } from "../src/index.js";
import { calc, casual, input, partTime, shift } from "./helpers.js";

/**
 * Rule set r2 prices what r1 only flagged. Every expected amount below is worked out by hand from
 * the rates the award publishes in Schedule B (B.1 full-time/part-time, B.2 casual, B.3 junior),
 * never from WageGuard's output. Adult Level 1 rates used: 27.81 (100%), 34.76 (125%), 41.72 (150%),
 * 48.67 (175%), 55.62 (200%), 62.57 (225%), 69.53 (250%), 76.48 (275%), 43.11 (155%).
 */
const lines = (result: PayPeriodCalculationResult): [string, string, string][] =>
  result.lines.map((l) => [l.ruleId, l.hourlyRate, l.amount]);
const blocking = (result: PayPeriodCalculationResult) => result.issues.filter(isBlocking).map((i) => i.code);
const codes = (result: PayPeriodCalculationResult) => result.issues.map((i) => i.code);
const week = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];
const fullDay = (d: string, from = "09:00", to = "17:30") =>
  shift(d, `${d}T${from}`, `${d}T${to}`, [`${d}T12:00`, `${d}T12:30`]);

describe("overtime (cl. 10.8, 21.2, Table 10 and Table 11)", () => {
  it("prices casual work after 9 pm on a weekday as overtime outside the span", () => {
    // 19:00-21:00 evening 2h x 41.72 = 83.44; 21:00-22:00 first-tier overtime 1h x 48.67 (175%) = 48.67
    const result = calc(input(casual(), [shift("s1", "2026-07-06T19:00", "2026-07-06T22:00")]));
    expect(result.status).toBe(CalculationStatus.CALCULATED);
    expect(lines(result)).toEqual([
      ["MA000004.PEN.WEEKDAY_AFTER_6PM", "41.72", "83.44"],
      ["MA000004.OT.MON_SAT_FIRST_3H", "48.67", "48.67"],
    ]);
    expect(result.totals.amount).toBe("132.11");
    expect(result.shifts[0]?.segments.at(-1)).toMatchObject({ overtimeReason: "SPAN", minutes: 60 });
    expect(codes(result)).toContain("OVERTIME_CALCULATED");
  });

  it("allows one 11-hour day a week and pays the rest of a long day beyond 9 hours as overtime", () => {
    // Tue and Wed 07:00-18:00 less 30 min = 10.5h each. Tue is the week's long day (11h allowed);
    // Wed's last 1.5h (16:30-18:00) is overtime: 1.5 x 48.67 = 73.005 -> 73.01.
    // Ordinary: 10.5h + 9h = 19.5h x 34.76 = 677.82. Total 750.83.
    const result = calc(
      input(casual(), [fullDay(week[1]!, "07:00", "18:00"), fullDay(week[2]!, "07:00", "18:00")]),
    );
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "34.76", "677.82"],
      ["MA000004.OT.MON_SAT_FIRST_3H", "48.67", "73.01"],
    ]);
    expect(result.totals.amount).toBe("750.83");
    const wed = result.shifts[1]!.segments.at(-1)!;
    expect([wed.localStart, wed.localEnd, wed.overtimeReason]).toEqual([
      "2026-07-08T16:30",
      "2026-07-08T18:00",
      "DAILY",
    ]);
  });

  it("pays a casual's hours beyond 38 in a week as overtime, taking the last hours worked", () => {
    // Mon-Fri 8h each = 40h. The last 2h on Friday are overtime: 2 x 48.67 = 97.34; 38h x 34.76 = 1320.88.
    const result = calc(
      input(
        casual(),
        week.map((d) => fullDay(d)),
      ),
    );
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "34.76", "1320.88"],
      ["MA000004.OT.MON_SAT_FIRST_3H", "48.67", "97.34"],
    ]);
    expect(result.totals.amount).toBe("1418.22");
    expect(result.shifts[4]!.segments.at(-1)).toMatchObject({
      localStart: "2026-07-10T15:30",
      overtimeReason: "WEEKLY",
    });
  });

  it("counts shifts from earlier in the week, before the pay period, without pricing them", () => {
    // Context Mon-Wed 24h; period Thu-Fri 16h. Week total 40h: Friday's last 2h are overtime.
    // 14h x 34.76 = 486.64 + 2h x 48.67 = 97.34 = 583.98. Without the context shifts: 16h x 34.76 = 556.16.
    const period = { startDate: "2026-07-09", endDate: "2026-07-22" };
    const withContext = calc({
      ...input(casual(), [fullDay(week[3]!), fullDay(week[4]!)]),
      payPeriod: period,
      contextShifts: [fullDay(week[0]!), fullDay(week[1]!), fullDay(week[2]!)],
    });
    expect(withContext.totals.amount).toBe("583.98");
    expect(withContext.shifts.map((s) => s.shiftId)).toEqual([week[3], week[4]]);
    const alone = calc({ ...input(casual(), [fullDay(week[3]!), fullDay(week[4]!)]), payPeriod: period });
    expect(alone.totals.amount).toBe("556.16");
  });

  it("pays part-time hours beyond the day's guaranteed hours as overtime, unless varied in writing", () => {
    // 330 paid minutes, 240 guaranteed: 240 x 27.81/60 = 111.24; last 90 min at 150% = 1.5 x 41.72 = 62.58.
    const shifts = [
      shift("s1", "2026-07-07T09:00", "2026-07-07T15:00", ["2026-07-07T12:00", "2026-07-07T12:30"]),
    ];
    const result = calc(input(partTime({ TUE: 240 }), shifts));
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "27.81", "111.24"],
      ["MA000004.OT.MON_SAT_FIRST_3H", "41.72", "62.58"],
    ]);
    expect(result.totals.amount).toBe("173.82");
    // Varied to 330 minutes for that day (cl. 10.6): 5.5h x 27.81 = 152.955 -> 152.96.
    const varied = calc(
      input(partTime({ TUE: 240 }), shifts, {
        guaranteedHoursVariations: [{ date: "2026-07-07", minutes: 330 }],
      }),
    );
    expect(varied.totals.amount).toBe("152.96");
  });

  it("moves to the higher overtime rate after 3 hours of overtime in a day", () => {
    // No guaranteed hours on Tuesday, so all 4h are overtime: 3h x 41.72 = 125.16; 1h x 55.62 (200%) = 55.62.
    const result = calc(input(partTime({ MON: 480 }), [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")]));
    expect(lines(result)).toEqual([
      ["MA000004.OT.MON_SAT_FIRST_3H", "41.72", "125.16"],
      ["MA000004.OT.MON_SAT_AFTER_3H", "55.62", "55.62"],
    ]);
  });

  it("prices Saturday overtime in two tiers and Sunday overtime at one rate", () => {
    // Sat 07:00-23:00, meals 12:00-12:30 and 17:00-17:30: 10h in the span x 41.72 = 417.20;
    // 18:00-21:00 3h x 48.67 = 146.01; 21:00-23:00 2h x 62.57 = 125.14. Total 688.35.
    const saturday = calc(
      input(casual(), [
        {
          ...shift("sat", "2026-07-11T07:00", "2026-07-11T23:00"),
          breaks: [
            { kind: "UNPAID_MEAL", start: "2026-07-11T12:00", end: "2026-07-11T12:30" },
            { kind: "UNPAID_MEAL", start: "2026-07-11T17:00", end: "2026-07-11T17:30" },
          ],
        },
      ]),
    );
    expect(lines(saturday)).toEqual([
      ["MA000004.PEN.SATURDAY", "41.72", "417.20"],
      ["MA000004.OT.MON_SAT_FIRST_3H", "48.67", "146.01"],
      ["MA000004.OT.MON_SAT_AFTER_3H", "62.57", "125.14"],
    ]);
    expect(saturday.totals.amount).toBe("688.35");
    // Sunday 07:00-12:00: before 9 am is outside the span, 2h x 62.57 (225%) = 125.14; 3h x 48.67 = 146.01.
    const sunday = calc(input(casual(), [shift("sun", "2026-07-12T07:00", "2026-07-12T12:00")]));
    expect(lines(sunday)).toEqual([
      ["MA000004.PEN.SUNDAY", "48.67", "146.01"],
      ["MA000004.OT.SUNDAY", "62.57", "125.14"],
    ]);
  });

  it("pays full-time hours beyond 38 a week as overtime at the full-time rate (Level 3)", () => {
    // Level 3: 28.89. 40h Mon-Fri; the last 2h on Friday at 150% = 43.335 -> 43.34 x 2 = 86.68; 38h x 28.89 = 1097.82.
    const result = calc(
      input(
        casual({ employmentType: "FULL_TIME", classificationCode: "RETAIL_EMPLOYEE_LEVEL_3" }),
        week.map((d) => fullDay(d, "08:00", "16:30")),
      ),
    );
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "28.89", "1097.82"],
      ["MA000004.OT.MON_SAT_FIRST_3H", "43.34", "86.68"],
    ]);
    expect(result.totals.amount).toBe("1184.50");
  });

  it("does not treat a week over 38 hours as overtime under an averaging roster, and asks for review", () => {
    const result = calc(
      input(
        casual({ averagingRoster: true }),
        week.map((d) => fullDay(d)),
      ),
    );
    expect(result.status).toBe(CalculationStatus.REVIEW_REQUIRED);
    expect(blocking(result)).toEqual(["AVERAGING_ROSTER_WEEKLY_HOURS"]);
    expect(result.totals.pricedMinutes).toBe(0);
  });
});

describe("public holidays (cl. 22.1, 33.3)", () => {
  const october = { startDate: "2026-09-28", endDate: "2026-10-11" };

  it("pays work on a public holiday at the public holiday rate", () => {
    // Labour Day, NSW, Monday 5 October 2026: 4h x 69.53 (casual 250%) = 278.12.
    const result = calc({
      ...input(casual(), [shift("s1", "2026-10-05T09:00", "2026-10-05T13:00")]),
      payPeriod: october,
      publicHolidays: [{ date: "2026-10-05", name: "Labour Day" }],
    });
    expect(result.status).toBe(CalculationStatus.CALCULATED);
    expect(lines(result)).toEqual([["MA000004.PH.ALL_ORDINARY", "69.53", "278.12"]]);
    expect(codes(result)).toContain("PUBLIC_HOLIDAY_RATE_APPLIED");
  });

  it("pays overtime on a public holiday at the public holiday overtime rate", () => {
    // 09:00-23:00 less 30 min. In the span: 690 min, of which 660 are ordinary (the week's 11-hour day)
    // = 11h x 69.53 = 764.83. Overtime: 30 min daily + 2h outside the span = 2.5h x 76.48 (275%) = 191.20.
    const result = calc({
      ...input(casual(), [
        shift("s1", "2026-10-05T09:00", "2026-10-05T23:00", ["2026-10-05T13:00", "2026-10-05T13:30"]),
      ]),
      payPeriod: october,
      publicHolidays: [{ date: "2026-10-05" }],
    });
    expect(lines(result)).toEqual([
      ["MA000004.PH.ALL_ORDINARY", "69.53", "764.83"],
      ["MA000004.OT.PUBLIC_HOLIDAY", "76.48", "191.20"],
    ]);
    expect(result.totals.amount).toBe("956.03");
  });

  it("starts a part-day public holiday at its listed time", () => {
    // Christmas Eve, SA, from 7 pm: 17-18 ordinary 34.76; 18-19 evening 41.72; 19-21 2h x 69.53 = 139.06.
    const result = calc({
      ...input(casual({ timeZone: "Australia/Adelaide" }), [
        shift("s1", "2026-12-24T17:00", "2026-12-24T21:00"),
      ]),
      payPeriod: { startDate: "2026-12-21", endDate: "2027-01-03" },
      publicHolidays: [{ date: "2026-12-24", from: "19:00", name: "Christmas Eve" }],
    });
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "34.76", "34.76"],
      ["MA000004.PEN.WEEKDAY_AFTER_6PM", "41.72", "41.72"],
      ["MA000004.PH.ALL_ORDINARY", "69.53", "139.06"],
    ]);
    expect(result.totals.amount).toBe("215.54");
  });
});

describe("minimum engagement (cl. 10.9, 11.2, 11.3)", () => {
  it("tops a short casual shift up to 3 hours at the rate of the last minute worked", () => {
    // 2h x 34.76 = 69.52 worked, plus a 1h top-up at 34.76.
    const result = calc(input(casual(), [shift("s1", "2026-07-07T10:00", "2026-07-07T12:00")]));
    expect(result.status).toBe(CalculationStatus.CALCULATED);
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "34.76", "69.52"],
      ["MA000004.TOPUP.MINIMUM_ENGAGEMENT", "34.76", "34.76"],
    ]);
    expect(result.shifts[0]?.topUpMinutes).toBe(60);
    expect(result.totals.amount).toBe("104.28");
  });

  it("uses the 1.5-hour engagement for an eligible school student after school", () => {
    const student = casual({ schoolStudent: true });
    // 15:30-16:30 is 1h: topped up by 30 min. 1h x 34.76 + 0.5h x 34.76 = 34.76 + 17.38 = 52.14.
    const short = calc(input(student, [shift("s1", "2026-07-07T15:30", "2026-07-07T16:30")]));
    expect(short.lines.map((l) => l.amount)).toEqual(["34.76", "17.38"]);
    // 15:30-17:00 is already 1.5h: no top-up. 1.5h x 34.76 = 52.14.
    const exact = calc(input(student, [shift("s1", "2026-07-07T15:30", "2026-07-07T17:00")]));
    expect(exact.lines.map((l) => l.amount)).toEqual(["52.14"]);
  });

  it("tops a short part-time shift up to 3 consecutive hours", () => {
    // 2h x 27.81 = 55.62 plus 1h x 27.81 = 27.81.
    const result = calc(input(partTime({ TUE: 180 }), [shift("s1", "2026-07-07T09:00", "2026-07-07T11:00")]));
    expect(result.totals.amount).toBe("83.43");
  });
});

describe("break between work days (cl. 16.6)", () => {
  const shifts = [
    shift("mon", "2026-07-06T12:00", "2026-07-06T21:00", ["2026-07-06T16:00", "2026-07-06T16:30"]),
    shift("tue", "2026-07-07T07:00", "2026-07-07T12:00"),
  ];

  it("pays work before a 12-hour break at 200% (225% for casuals, derived from cl. 11.1)", () => {
    // Monday: 5.5h x 34.76 = 191.18 + 3h x 41.72 = 125.16. Tuesday (10h break): 5h x 62.57 = 312.85.
    const result = calc(input(casual(), shifts));
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "34.76", "191.18"],
      ["MA000004.PEN.WEEKDAY_AFTER_6PM", "41.72", "125.16"],
      ["MA000004.BREAK.LESS_THAN_12_HOURS", "62.57", "312.85"],
    ]);
    expect(result.totals.amount).toBe("629.19");
    expect(result.shifts[1]?.segments[0]?.overriddenRuleIds).toEqual(["MA000004.ORD.WEEKDAY"]);
  });

  it("accepts a 10-hour break where one has been agreed (cl. 16.6(d))", () => {
    // Tuesday at ordinary rates: 5h x 34.76 = 173.80. Total 191.18 + 125.16 + 173.80 = 490.14.
    expect(calc(input(casual({ reducedBreakAgreed: true }), shifts)).totals.amount).toBe("490.14");
  });
});

describe("junior rates (cl. 17.2, Schedule B.3)", () => {
  const junior = (dateOfBirth: string, overrides = {}) =>
    casual({
      dateOfBirth,
      declarations: {
        awardCoverage: "CONFIRMED",
        enterpriseAgreement: "NONE",
        ageBand: "UNDER_21",
        shiftworker: "NO",
      },
      ...overrides,
    });

  it("pays a 17-year-old casual 60% of the adult rate, with the casual loading on top", () => {
    // 1056.80 x 60% / 38 = 16.686 -> 16.69 (B.3.1); x 125% = 20.8625 -> 20.86; 4h = 83.44.
    const result = calc(input(junior("2009-03-15"), [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")]));
    expect(result.lines[0]).toMatchObject({ baseHourlyRate: "16.69", hourlyRate: "20.86", amount: "83.44" });
    expect(result.shifts[0]?.segments[0]?.baseRate).toEqual({
      band: "AGE_17",
      hourlyRate: "16.69",
      juniorPercent: "60",
    });
  });

  it("changes rate on the employee's birthday", () => {
    // Turns 18 on Fri 10 July: Thursday 4h x 20.86 = 83.44; Friday 18-year-old 19.47 x 125% = 24.34, 4h = 97.36.
    const result = calc(
      input(junior("2008-07-10"), [
        shift("thu", "2026-07-09T09:00", "2026-07-09T13:00"),
        shift("fri", "2026-07-10T09:00", "2026-07-10T13:00"),
      ]),
    );
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "20.86", "83.44"],
      ["MA000004.ORD.WEEKDAY", "24.34", "97.36"],
    ]);
    expect(result.totals.amount).toBe("180.80");
  });

  it("needs the start date for a 20-year-old, and pays 90% in the first 6 months", () => {
    const shifts = [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")];
    const missing = calc(input(junior("2006-01-01"), shifts));
    expect(missing.status).toBe(CalculationStatus.INCOMPLETE_DATA);
    expect(blocking(missing)).toEqual(["EMPLOYMENT_START_DATE_MISSING"]);
    // 1056.80 x 90% / 38 = 25.0295 -> 25.03; x 125% = 31.2875 -> 31.29; 4h = 125.16.
    const recent = calc(input(junior("2006-01-01", { employmentStartDate: "2026-03-01" }), shifts));
    expect(recent.lines[0]).toMatchObject({ baseHourlyRate: "25.03", hourlyRate: "31.29", amount: "125.16" });
  });

  it("pays adult rates to juniors above Level 3, and needs a date of birth for juniors", () => {
    // Level 4 adult 29.45 x 125% = 36.8125 -> 36.81; 4h = 147.24.
    const shifts = [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")];
    const levelFour = calc(
      input(junior("2009-03-15", { classificationCode: "RETAIL_EMPLOYEE_LEVEL_4" }), shifts),
    );
    expect(levelFour.totals.amount).toBe("147.24");
    const noBirthday = calc(input({ ...junior("2009-03-15"), dateOfBirth: undefined }, shifts));
    expect(blocking(noBirthday)).toEqual(["DATE_OF_BIRTH_MISSING"]);
  });
});

describe("shiftwork (Part 6)", () => {
  const shiftworker = casual({
    declarations: {
      awardCoverage: "CONFIRMED",
      enterpriseAgreement: "NONE",
      ageBand: "ADULT_21_PLUS",
      shiftworker: "YES",
    },
  });

  it("pays a night shift at the shiftwork rate, with breaks paid", () => {
    // Tue 22:00 - Wed 06:00 = 8h (the recorded meal break is paid, cl. 26) x 43.11 (casual 155%) = 344.88.
    const result = calc(
      input(shiftworker, [
        shift("n1", "2026-07-07T22:00", "2026-07-08T06:00", ["2026-07-08T02:00", "2026-07-08T02:30"]),
      ]),
    );
    expect(lines(result)).toEqual([["MA000004.SHIFT.MON_FRI", "43.11", "344.88"]]);
    expect(result.totals.paidMinutes).toBe(480);
  });

  it("pays the Saturday shiftwork rate after midnight Friday", () => {
    // Fri 22:00-24:00 2h x 43.11 = 86.22; Sat 00:00-06:00 6h x 48.67 (175%) = 292.02.
    const result = calc(input(shiftworker, [shift("n1", "2026-07-10T22:00", "2026-07-11T06:00")]));
    expect(result.totals.amount).toBe("378.24");
  });

  it("does not treat an evening shift within the span on one day as shiftwork (cl. 24.3)", () => {
    const result = calc(input(shiftworker, [shift("e1", "2026-07-06T18:00", "2026-07-06T21:00")]));
    expect(lines(result)).toEqual([["MA000004.PEN.WEEKDAY_AFTER_6PM", "41.72", "125.16"]]);
  });
});

describe("span of hours exceptions (cl. 15.2)", () => {
  it("lets a newsagency start ordinary hours at 5 am", () => {
    const result = calc(
      input(casual({ spanException: "NEWSAGENCY" }), [shift("s1", "2026-07-07T05:00", "2026-07-07T09:00")]),
    );
    expect(lines(result)).toEqual([
      ["MA000004.ORD.WEEKDAY", "34.76", "69.52"],
      ["MA000004.ORD.WEEKDAY_FROM_5AM_NEWSAGENCY", "34.76", "69.52"],
    ]);
  });

  it("lets a video shop work ordinary hours until midnight", () => {
    // Sat 17:00-18:00 41.72; 18:00-23:00 5h x 41.72 = 208.60 (Saturday ordinary hours, not overtime).
    const result = calc(
      input(casual({ spanException: "VIDEO_SHOP" }), [shift("s1", "2026-07-11T17:00", "2026-07-11T23:00")]),
    );
    expect(result.totals.amount).toBe("250.32");
    expect(result.lines.map((l) => l.category)).toEqual(["PENALTY", "PENALTY"]);
  });
});

describe("allowances (cl. 19) and leave (cl. 28, NES)", () => {
  it("adds declared and claimed allowances as separate lines", () => {
    // Two 4h Mondays in different weeks: 8h x 34.76 = 278.08. Laundry 2 shifts x 1.28 = 2.56;
    // first aid 2 weeks x 14.55 = 29.10; 12.5 km x 1.00 = 12.50. Total 322.24.
    const result = calc(
      input(
        casual({
          allowances: {
            laundersSpecialClothing: true,
            appointedFirstAider: true,
            holdsLiquorLicence: false,
            brokenHill: false,
          },
        }),
        [
          shift("a", "2026-07-06T09:00", "2026-07-06T13:00"),
          shift("b", "2026-07-13T09:00", "2026-07-13T13:00"),
        ],
        { allowanceClaims: { vehicleKilometres: "12.5" } },
      ),
    );
    expect(
      result.lines.filter((l) => l.category === "ALLOWANCE").map((l) => [l.ruleId, l.quantity, l.amount]),
    ).toEqual([
      ["MA000004.ALW.LAUNDRY_PER_SHIFT", "2", "2.56"],
      ["MA000004.ALW.FIRST_AID", "2", "29.10"],
      ["MA000004.ALW.MOTOR_VEHICLE", "12.5", "12.50"],
    ]);
    expect(result.totals).toMatchObject({ amount: "322.24", timeAmount: "278.08", allowanceAmount: "44.16" });
  });

  it("pays cold work by the hour, with the extra rate below zero", () => {
    // 4h x 34.76 = 139.04; cold 1.5h x 0.38 = 0.57; below zero 0.5h x 0.59 = 0.295 -> 0.30. Total 139.91.
    const result = calc(
      input(casual(), [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")], {
        allowanceClaims: { coldWorkMinutes: 90, belowZeroMinutes: 30 },
      }),
    );
    expect(result.totals.amount).toBe("139.91");
  });

  it("pays a meal allowance when more than an hour of overtime was worked without notice", () => {
    // The two-long-days week above (750.83, Wednesday has 1.5h overtime) plus 24.56 = 775.39.
    const result = calc(
      input(casual(), [fullDay(week[1]!, "07:00", "18:00"), fullDay(week[2]!, "07:00", "18:00")], {
        allowanceClaims: { mealAllowanceDates: [week[1]!, week[2]!] },
      }),
    );
    expect(result.totals.amount).toBe("775.39");
  });

  it("prices annual leave at the base rate plus the 17.5% minimum loading", () => {
    // Tue 4h x 27.81 = 111.24; leave 7.6h x 27.81 = 211.356 -> 211.36; loading 27.81 x 17.5% = 4.86675 -> 4.87,
    // x 7.6h = 37.012 -> 37.01. Total 359.61.
    const result = calc(
      input(partTime({ TUE: 240 }), [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")], {
        leave: [{ kind: "ANNUAL", minutes: 456 }],
      }),
    );
    expect(result.lines.slice(1).map((l) => [l.ruleId, l.hourlyRate, l.amount])).toEqual([
      ["MA000004.LEAVE.ANNUAL", "27.81", "211.36"],
      ["MA000004.LEAVE.ANNUAL_LOADING", "4.87", "37.01"],
    ]);
    expect(result.totals).toMatchObject({ amount: "359.61", leaveAmount: "248.37" });
    expect(codes(result)).toContain("ANNUAL_LEAVE_LOADING_MINIMUM");
  });

  it("does not price paid leave for a casual", () => {
    const result = calc(
      input(casual(), [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")], {
        leave: [{ kind: "ANNUAL", minutes: 456 }],
      }),
    );
    expect(result.totals.amount).toBe("139.04");
    expect(codes(result)).toContain("CASUAL_PAID_LEAVE_NOT_APPLICABLE");
  });
});

describe("scope that stays unsupported", () => {
  it.each([
    [{ bakingProduction: true }, "BAKING_PRODUCTION_NOT_SUPPORTED"],
    [{ apprentice: true }, "APPRENTICE_NOT_SUPPORTED"],
  ])("%j -> %s", (overrides, code) => {
    const shiftworker = casual({
      ...overrides,
      declarations: {
        awardCoverage: "CONFIRMED",
        enterpriseAgreement: "NONE",
        ageBand: "ADULT_21_PLUS",
        shiftworker: "YES",
      },
    });
    const result = calc(input(shiftworker, [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")]));
    expect(result.status).toBe(CalculationStatus.UNSUPPORTED_SCENARIO);
    expect(blocking(result)).toEqual([code]);
  });

  it("rejects a classification the rule set does not have", () => {
    const result = calc(
      input(casual({ classificationCode: "RETAIL_EMPLOYEE_LEVEL_9" }), [
        shift("s1", "2026-07-07T09:00", "2026-07-07T13:00"),
      ]),
    );
    expect(blocking(result)).toEqual(["CLASSIFICATION_NOT_SUPPORTED"]);
  });
});
