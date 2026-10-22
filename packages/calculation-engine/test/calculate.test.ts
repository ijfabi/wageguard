import { readFileSync } from "node:fs";

import { bundledRegistry } from "@wageguard/award-rules";
import { DomainValidationError } from "@wageguard/domain";
import { describe, expect, it } from "vitest";

import {
  CalculationStatus,
  ENGINE_VERSION,
  calculatePayPeriod,
  type PayPeriodCalculationResult,
} from "../src/index.js";
import {
  FORTNIGHT,
  calc,
  casual,
  context,
  draftContext,
  draftRuleSet,
  input,
  partTime,
  shift,
} from "./helpers.js";

const lineAmounts = (result: PayPeriodCalculationResult): Record<string, string> =>
  Object.fromEntries(result.lines.map((l) => [l.ruleId, l.amount]));
const issueCodes = (result: PayPeriodCalculationResult): string[] => result.issues.map((i) => i.code);
const validationCodes = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (error: unknown) {
    if (error instanceof DomainValidationError) {
      return error.issues.map((i) => i.code);
    }
    throw error;
  }
  return [];
};

describe("supported scenarios (expected values derived by hand from Schedule B published rates)", () => {
  it("casual weekday ordinary hours: 7.5h x $34.76 = $260.70", () => {
    const result = calc(
      input(casual(), [
        shift("s1", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"]),
      ]),
    );
    expect(result.status).toBe(CalculationStatus.CALCULATED);
    expect(result.totals).toEqual({
      amount: "260.70",
      pricedMinutes: 450,
      unpricedMinutes: 0,
      paidMinutes: 450,
      isComplete: true,
    });
    expect(result.lines[0]).toMatchObject({
      ruleId: "MA000004.ORD.WEEKDAY",
      percentOfMinimumHourlyRate: "125",
      baseHourlyRate: "27.81",
      hourlyRate: "34.76",
      minutes: 450,
      hours: "7.5",
    });
  });

  it("part-time shift crossing 6 pm splits into ordinary and evening penalty lines", () => {
    // 14:00-16:00 + 16:30-18:00 = 3.5h x 27.81 = 97.335 -> 97.34; 18:00-20:00 = 2h x 34.76 = 69.52
    const result = calc(
      input(partTime({ MON: 330 }), [
        shift("s1", "2026-07-06T14:00", "2026-07-06T20:00", ["2026-07-06T16:00", "2026-07-06T16:30"]),
      ]),
    );
    expect(result.status).toBe(CalculationStatus.CALCULATED);
    expect(lineAmounts(result)).toEqual({
      "MA000004.ORD.WEEKDAY": "97.34",
      "MA000004.PEN.WEEKDAY_AFTER_6PM": "69.52",
    });
    expect(result.totals.amount).toBe("166.86");
    expect(result.shifts[0]?.segments.map((s) => [s.localStart, s.localEnd, s.minutes])).toEqual([
      ["2026-07-06T14:00", "2026-07-06T16:00", 120],
      ["2026-07-06T16:30", "2026-07-06T18:00", 90],
      ["2026-07-06T18:00", "2026-07-06T20:00", 120],
    ]);
  });

  it("casual Saturday uses the Table 12 casual rate of 150% (casual loading is not added again)", () => {
    const result = calc(
      input(casual(), [
        shift("s1", "2026-07-11T08:00", "2026-07-11T16:30", ["2026-07-11T12:00", "2026-07-11T12:30"]),
      ]),
    );
    expect(result.lines[0]).toMatchObject({
      ruleId: "MA000004.PEN.SATURDAY",
      hourlyRate: "41.72",
      amount: "333.76",
    });
    expect(result.lines[0]?.hourlyRate).not.toBe("43.45"); // 27.81 x 1.25 x 1.25 would double-count the loading
  });

  it("casual Sunday: 5.5h x $48.67 = $267.685 -> $267.69 (half-up)", () => {
    const result = calc(
      input(casual(), [
        shift("s1", "2026-07-12T10:00", "2026-07-12T16:00", ["2026-07-12T13:00", "2026-07-12T13:30"]),
      ]),
    );
    expect(lineAmounts(result)).toEqual({ "MA000004.PEN.SUNDAY": "267.69" });
  });

  it("aggregates one line per rule across a pay period, in rule-set order", () => {
    const result = calc(
      input(casual(), [
        shift("sun", "2026-07-12T10:00", "2026-07-12T16:00", ["2026-07-12T13:00", "2026-07-12T13:30"]),
        shift("mon", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"]),
        shift("sat", "2026-07-11T08:00", "2026-07-11T16:30", ["2026-07-11T12:00", "2026-07-11T12:30"]),
      ]),
    );
    expect(result.status).toBe(CalculationStatus.CALCULATED);
    expect(result.lines.map((l) => [l.ruleId, l.amount, l.shiftIds])).toEqual([
      ["MA000004.ORD.WEEKDAY", "260.70", ["mon"]],
      ["MA000004.PEN.SATURDAY", "333.76", ["sat"]],
      ["MA000004.PEN.SUNDAY", "267.69", ["sun"]],
    ]);
    expect(result.totals.amount).toBe("862.15");
    expect(result.shifts.map((s) => s.shiftId)).toEqual(["mon", "sat", "sun"]);
  });

  it("rounds once per pay line, and reports per-shift indicative amounts separately", () => {
    // Two 200-minute shifts: each 34.76 x 200/60 = 115.866... -> 115.87, but the 400-minute line is 231.733... -> 231.73.
    const result = calc(
      input(casual(), [
        shift("a", "2026-07-07T09:00", "2026-07-07T12:20"),
        shift("b", "2026-07-08T09:00", "2026-07-08T12:20"),
      ]),
    );
    expect(result.lines[0]).toMatchObject({ minutes: 400, amount: "231.73" });
    expect(result.shifts.map((s) => s.indicativeAmount)).toEqual(["115.87", "115.87"]);
  });

  it("treats rule-window boundaries as half-open: 17:00-19:00 is exactly 60 + 60 minutes", () => {
    const result = calc(input(casual(), [shift("s1", "2026-07-06T15:00", "2026-07-06T19:00")]));
    expect(result.shifts[0]?.segments.map((s) => s.minutes)).toEqual([180, 60]);
  });

  it("does not deduct paid rest breaks", () => {
    const result = calc(
      input(casual(), [
        {
          ...shift("s1", "2026-07-06T09:00", "2026-07-06T13:00"),
          breaks: [{ kind: "PAID_REST", start: "2026-07-06T10:30", end: "2026-07-06T10:40" }],
        },
      ]),
    );
    expect(result.totals.paidMinutes).toBe(240);
    expect(result.shifts[0]?.unpaidBreakMinutes).toBe(0);
  });
});

describe("metadata and explanation trace", () => {
  const result = calc(input(casual(), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]));

  it("records award, rule-set version, fingerprint, source, rounding, engine version and input hash", () => {
    expect(result.metadata).toMatchObject({
      resultSchemaVersion: 1,
      engineVersion: ENGINE_VERSION,
      awardCode: "MA000004",
      ruleSetVersion: "MA000004/2026-07-01/r1",
      ruleSetEffectiveFrom: "2026-07-01",
      ruleSetEffectiveBasis: "FIRST_FULL_PAY_PERIOD_ON_OR_AFTER",
      sourceUrl: "https://awards.fairwork.gov.au/MA000004.html",
      sourceConsolidatedAsAt: "2026-07-01",
      calculatedAt: "2026-10-22T00:00:00.000Z",
      timeZone: "Australia/Sydney",
    });
    expect(result.metadata.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.metadata.ruleSetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.metadata.roundingPolicy?.lineAmount.mode).toBe("HALF_UP");
    expect(result.metadata.verification).toMatch(/not been reviewed by a qualified/);
  });

  it("produces a trace covering every pipeline stage", () => {
    expect(result.trace.map((t) => t.step)).toEqual([
      "INPUT_VALIDATED",
      "RULE_SET_RESOLVED",
      "SCOPE_CHECKED",
      "SHIFTS_SEGMENTED",
      "ENTITLEMENT_CHECKS_APPLIED",
      "RATES_APPLIED",
      "LINES_AGGREGATED",
      "STATUS_DETERMINED",
    ]);
  });

  it("explains each segment with its rule, percentage and clauses", () => {
    expect(result.shifts[0]?.segments[0]?.classification).toEqual({
      kind: "RULE",
      ruleId: "MA000004.ORD.WEEKDAY",
      category: "ORDINARY",
      description: "Ordinary hours Monday to Friday, 7.00 am to 6.00 pm",
      percentOfMinimumHourlyRate: "125",
      clauseRefs: ["15.1", "11.1", "Schedule B"],
    });
    expect(result.assumptions.length).toBeGreaterThan(5);
  });

  it("matches the package version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(ENGINE_VERSION).toBe(pkg.version);
  });
});

describe("review-required scenarios are detected and never priced", () => {
  it("work after 9 pm Monday-Friday is outside the span of ordinary hours", () => {
    const result = calc(input(casual(), [shift("s1", "2026-07-06T19:00", "2026-07-06T22:00")]));
    expect(result.status).toBe(CalculationStatus.REVIEW_REQUIRED);
    expect(issueCodes(result)).toEqual(["OUTSIDE_SPAN_OF_ORDINARY_HOURS"]);
    expect(result.totals).toMatchObject({
      amount: "0.00",
      pricedMinutes: 0,
      unpricedMinutes: 180,
      isComplete: false,
    });
    expect(result.lines).toEqual([]);
    expect(result.shifts[0]?.segments.map((s) => [s.classification.kind, s.minutes, s.hourlyRate])).toEqual([
      ["RULE", 120, null],
      ["OUTSIDE_SPAN", 60, null],
    ]);
  });

  it("splits cross-midnight shifts by local date", () => {
    const result = calc(input(casual(), [shift("s1", "2026-07-10T20:00", "2026-07-11T02:00")]));
    expect(result.shifts[0]?.segments.map((s) => [s.localDate, s.classification.kind, s.minutes])).toEqual([
      ["2026-07-10", "RULE", 60],
      ["2026-07-10", "OUTSIDE_SPAN", 180],
      ["2026-07-11", "OUTSIDE_SPAN", 120],
    ]);
  });

  it("flags shifts shorter than the 3-hour minimum engagement", () => {
    const result = calc(input(casual(), [shift("s1", "2026-07-07T10:00", "2026-07-07T12:00")]));
    expect(issueCodes(result)).toEqual(["MINIMUM_ENGAGEMENT_SHORTFALL"]);
    expect(result.issues[0]?.clauseRefs).toEqual(["11.2"]);
  });

  it("flags declared public holidays instead of applying an unverified holiday rate", () => {
    const result = calc(
      input(casual(), [shift("s1", "2026-07-06T09:00", "2026-07-06T13:00")], {
        declaredPublicHolidays: ["2026-07-06"],
      }),
    );
    expect(issueCodes(result)).toEqual(["PUBLIC_HOLIDAY_NOT_SUPPORTED"]);
    expect(result.shifts[0]?.segments[0]?.classification.kind).toBe("PUBLIC_HOLIDAY");
    expect(result.issues[0]?.date).toBe("2026-07-06");
  });

  it("flags part-time hours beyond the guaranteed hours for the weekday", () => {
    const result = calc(
      input(partTime({ MON: 240 }), [
        shift("s1", "2026-07-06T09:00", "2026-07-06T17:00", ["2026-07-06T12:00", "2026-07-06T12:30"]),
      ]),
    );
    expect(issueCodes(result)).toEqual(["PART_TIME_HOURS_EXCEED_GUARANTEED"]);
    expect(result.issues[0]?.message).toMatch(/450 paid minutes on 2026-07-06 \(MON\) exceed the 240/);
  });

  it("treats a part-time shift on a day with no guaranteed hours as exceeding them", () => {
    const result = calc(input(partTime({ MON: 480 }), [shift("s1", "2026-07-07T09:00", "2026-07-07T13:00")]));
    expect(issueCodes(result)).toEqual(["PART_TIME_HOURS_EXCEED_GUARANTEED"]);
  });

  it("flags more than 9 paid hours in a day and warns about long stretches without a meal break", () => {
    const result = calc(
      input(casual(), [
        shift("s1", "2026-07-07T07:00", "2026-07-07T18:00", ["2026-07-07T12:00", "2026-07-07T12:30"]),
      ]),
    );
    expect(issueCodes(result)).toEqual(["NO_MEAL_BREAK_AFTER_FIVE_HOURS", "DAILY_ORDINARY_HOURS_EXCEEDED"]);
    expect(result.status).toBe(CalculationStatus.REVIEW_REQUIRED);
  });

  it("flags casual weeks over 38 hours and every shift in that week", () => {
    const days = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"];
    const result = calc(
      input(
        casual(),
        days.map((d, i) => shift(`s${i}`, `${d}T09:00`, `${d}T17:30`, [`${d}T12:00`, `${d}T12:30`])),
      ),
    );
    const weekly = result.issues.find((i) => i.code === "CASUAL_WEEKLY_HOURS_EXCEEDED");
    expect(weekly?.shiftIds).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    expect(weekly?.date).toBe("2026-07-06");
    expect(result.totals.pricedMinutes).toBe(0);
  });

  it("flags less than 12 hours between work days and prices only the unaffected shift", () => {
    const result = calc(
      input(casual(), [
        shift("mon", "2026-07-06T12:00", "2026-07-06T21:00", ["2026-07-06T16:00", "2026-07-06T16:30"]),
        shift("tue", "2026-07-07T07:00", "2026-07-07T12:00"),
      ]),
    );
    expect(issueCodes(result)).toEqual(["INSUFFICIENT_BREAK_BETWEEN_WORK_DAYS"]);
    expect(result.issues[0]?.shiftIds).toEqual(["tue"]);
    // Monday only: 5.5h x 34.76 = 191.18 plus 3h x 41.72 = 125.16
    expect(result.totals).toMatchObject({
      amount: "316.34",
      pricedMinutes: 510,
      unpricedMinutes: 300,
      isComplete: false,
    });
    expect(result.shifts.map((s) => s.priced)).toEqual([true, false]);
  });

  it("does not apply the 12-hour rule to two shifts on the same day", () => {
    const result = calc(
      input(casual(), [
        shift("a", "2026-07-06T07:00", "2026-07-06T10:00"),
        shift("b", "2026-07-06T15:00", "2026-07-06T18:00"),
      ]),
    );
    expect(result.status).toBe(CalculationStatus.CALCULATED);
  });
});

describe("unsupported or incomplete employment is never calculated", () => {
  it.each([
    [{ employmentType: "FULL_TIME" as const }, "EMPLOYMENT_TYPE_NOT_SUPPORTED"],
    [{ classificationCode: "RETAIL_EMPLOYEE_LEVEL_2" }, "CLASSIFICATION_NOT_SUPPORTED"],
  ])("%j -> %s with no segments", (overrides, code) => {
    const result = calc(input(casual(overrides), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]));
    expect(result.status).toBe(CalculationStatus.UNSUPPORTED_SCENARIO);
    expect(issueCodes(result)).toContain(code);
    expect(result.shifts[0]).toMatchObject({ priced: false, segments: [], paidMinutes: 480 });
    expect(result.totals.amount).toBe("0.00");
  });

  it.each([
    [
      { enterpriseAgreement: "APPLIES" as const },
      "ENTERPRISE_AGREEMENT_APPLIES",
      CalculationStatus.UNSUPPORTED_SCENARIO,
    ],
    [{ ageBand: "UNDER_21" as const }, "JUNIOR_RATES_NOT_SUPPORTED", CalculationStatus.UNSUPPORTED_SCENARIO],
    [{ shiftworker: "YES" as const }, "SHIFTWORKER_NOT_SUPPORTED", CalculationStatus.UNSUPPORTED_SCENARIO],
    [
      { enterpriseAgreement: "UNSURE" as const },
      "ENTERPRISE_AGREEMENT_UNCONFIRMED",
      CalculationStatus.REVIEW_REQUIRED,
    ],
    [{ awardCoverage: "UNSURE" as const }, "AWARD_COVERAGE_UNCONFIRMED", CalculationStatus.REVIEW_REQUIRED],
    [{ ageBand: "UNSURE" as const }, "AGE_UNCONFIRMED", CalculationStatus.REVIEW_REQUIRED],
    [{ shiftworker: "UNSURE" as const }, "SHIFTWORKER_STATUS_UNCONFIRMED", CalculationStatus.REVIEW_REQUIRED],
  ])("declaration %j -> %s (%s), classified but unpriced", (declaration, code, status) => {
    const employment = casual();
    const result = calc(
      input({ ...employment, declarations: { ...employment.declarations, ...declaration } }, [
        shift("s1", "2026-07-06T09:00", "2026-07-06T13:00"),
      ]),
    );
    expect(result.status).toBe(status);
    expect(issueCodes(result)).toEqual([code]);
    expect(result.shifts[0]?.priced).toBe(false);
    expect(result.shifts[0]?.segments[0]?.hourlyRate).toBeNull();
    expect(result.lines).toEqual([]);
  });

  it("rejects award codes and time zones outside scope", () => {
    expect(
      issueCodes(
        calc(
          input(casual({ timeZone: "Pacific/Auckland" }), [
            shift("s1", "2026-07-06T09:00", "2026-07-06T13:00"),
          ]),
        ),
      ),
    ).toEqual(["TIME_ZONE_NOT_SUPPORTED"]);
    const otherAward = calc(
      input(casual({ awardCode: "MA000009" }), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]),
    );
    expect(issueCodes(otherAward)).toEqual(["NO_RULE_SET_FOR_PERIOD"]);
  });

  it("reports an award mismatch when a resolver returns a rule set for a different award", () => {
    const result = calculatePayPeriod(
      input(casual({ awardCode: "MA000009" }), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]),
      {
        ...context,
        rules: { resolveForPayPeriod: () => bundledRegistry().get("MA000004/2026-07-01/r1") },
      },
    );
    expect(issueCodes(result)).toContain("AWARD_NOT_SUPPORTED");
  });

  it("returns UNSUPPORTED_SCENARIO when no verified rule set covers the pay period", () => {
    const result = calc({
      ...input(casual(), [shift("s1", "2026-06-29T09:00", "2026-06-29T17:00")]),
      payPeriod: { startDate: "2026-06-29", endDate: "2026-07-12" },
    });
    expect(result.status).toBe(CalculationStatus.UNSUPPORTED_SCENARIO);
    expect(result.metadata.ruleSetVersion).toBeNull();
    expect(result.trace.map((t) => t.step)).toEqual([
      "INPUT_VALIDATED",
      "RULE_SET_NOT_FOUND",
      "STATUS_DETERMINED",
    ]);
  });

  it("returns INCOMPLETE_DATA for missing part-time guaranteed hours and for an empty pay period", () => {
    expect(
      calc(
        input(casual({ employmentType: "PART_TIME" }), [shift("s1", "2026-07-06T09:00", "2026-07-06T17:00")]),
      ).status,
    ).toBe(CalculationStatus.INCOMPLETE_DATA);
    const empty = calc(input(casual(), []));
    expect(empty.status).toBe(CalculationStatus.INCOMPLETE_DATA);
    expect(issueCodes(empty)).toEqual(["NO_SHIFTS"]);
  });
});

describe("input validation", () => {
  it("rejects unknown fields and wrong types structurally", () => {
    expect(validationCodes(() => calc({ ...input(casual(), []), extra: true } as never))).toEqual([
      "INVALID_INPUT",
    ]);
    expect(
      validationCodes(() => calc({ employment: casual(), payPeriod: FORTNIGHT, shifts: "nope" } as never)),
    ).toEqual(["INVALID_INPUT"]);
  });

  it("collects every domain problem at once", () => {
    const codes = validationCodes(() =>
      calc(
        input(
          casual(),
          [
            shift("a", "2026-07-06T09:00", "2026-07-06T13:00"),
            shift("a", "2026-07-06T12:00", "2026-07-06T15:00"),
            shift("c", "2026-07-25T09:00", "2026-07-25T13:00"),
            shift("d", "2026-07-07T09:00", "2026-07-07T08:00"),
          ],
          { declaredPublicHolidays: ["2026-08-01", "bad"] },
        ),
      ),
    );
    expect(codes.sort()).toEqual(
      [
        "INVALID_INPUT",
        "INVALID_INTERVAL",
        "INVALID_LOCAL_DATE",
        "INVALID_SHIFT",
        "OVERLAPPING_SHIFTS",
        "SHIFT_OUTSIDE_PAY_PERIOD",
      ].sort(),
    );
  });

  it("rejects invalid time zones, pay periods and DST-nonexistent times", () => {
    expect(validationCodes(() => calc(input(casual({ timeZone: "AEST" }), [])))).toEqual([
      "INVALID_TIME_ZONE",
    ]);
    expect(
      validationCodes(() =>
        calc({ ...input(casual(), []), payPeriod: { startDate: "2026-07-19", endDate: "2026-07-06" } }),
      ),
    ).toEqual(["INVALID_PAY_PERIOD"]);
    const dstPeriod = { startDate: "2026-09-28", endDate: "2026-10-11" };
    expect(
      validationCodes(() =>
        calc({
          ...input(casual(), [shift("s1", "2026-10-04T02:30", "2026-10-04T09:00")]),
          payPeriod: dstPeriod,
        }),
      ),
    ).toEqual(["NONEXISTENT_LOCAL_TIME"]);
  });

  it("accepts touching (back-to-back) shifts because intervals are half-open", () => {
    const result = calc(
      input(casual(), [
        shift("a", "2026-07-06T09:00", "2026-07-06T13:00"),
        shift("b", "2026-07-06T13:00", "2026-07-06T17:00"),
      ]),
    );
    expect(result.totals.paidMinutes).toBe(480);
  });
});

describe("time zones and daylight saving", () => {
  const dstPeriod = { startDate: "2026-09-28", endDate: "2026-10-11" };

  it("prices a Sunday shift on the DST-start day by elapsed time", () => {
    const result = calc({
      ...input(casual(), [shift("s1", "2026-10-04T09:00", "2026-10-04T15:00")]),
      payPeriod: dstPeriod,
    });
    expect(result.totals).toMatchObject({ paidMinutes: 360, amount: "292.02" }); // 6h x 48.67
  });

  it("measures an overnight shift across the DST change as 2 hours, not 3", () => {
    const result = calc({
      ...input(casual(), [shift("s1", "2026-10-04T01:00", "2026-10-04T04:00")]),
      payPeriod: dstPeriod,
    });
    expect(result.totals.paidMinutes).toBe(120);
    expect(result.shifts[0]?.segments[0]?.localEnd).toBe("2026-10-04T04:00");
  });

  it("applies windows in the employment's own Australian time zone", () => {
    const result = calc(
      input(casual({ timeZone: "Australia/Perth" }), [shift("s1", "2026-07-06T17:00", "2026-07-06T19:00")]),
    );
    expect(result.shifts[0]?.segments.map((s) => [s.localStart, s.minutes])).toEqual([
      ["2026-07-06T17:00", 60],
      ["2026-07-06T18:00", 60],
    ]);
  });
});

describe("rule versioning and precedence (test-only rule sets, not award rates)", () => {
  it("selects the historical rule set by pay period start and applies its own base rate", () => {
    const current = draftRuleSet((r) => {
      r.effective.until = "2027-07-01";
    });
    const next = draftRuleSet((r) => {
      r.version = "MA000004/2027-07-01/r1";
      r.effective.from = "2027-07-01";
      r.classifications[0]!.minimumHourlyRate = "30.00";
    });
    const ctx = draftContext(current, next);
    const before = calculatePayPeriod(
      {
        ...input(casual(), [shift("s1", "2027-06-28T09:00", "2027-06-28T13:00")]),
        payPeriod: { startDate: "2027-06-28", endDate: "2027-07-11" },
      },
      ctx,
    );
    const after = calculatePayPeriod(
      {
        ...input(casual(), [shift("s1", "2027-07-05T09:00", "2027-07-05T13:00")]),
        payPeriod: { startDate: "2027-07-05", endDate: "2027-07-18" },
      },
      ctx,
    );
    expect(before.metadata.ruleSetVersion).toBe("MA000004/2026-07-01/r1");
    expect(before.lines[0]?.hourlyRate).toBe("34.76");
    expect(after.metadata.ruleSetVersion).toBe("MA000004/2027-07-01/r1");
    expect(after.lines[0]?.hourlyRate).toBe("37.50");
  });

  it("keeps the old rule set for a pay period that started before the change, even for shifts after it", () => {
    const current = draftRuleSet((r) => {
      r.effective.until = "2027-07-01";
    });
    const next = draftRuleSet((r) => {
      r.version = "MA000004/2027-07-01/r1";
      r.effective.from = "2027-07-01";
      r.classifications[0]!.minimumHourlyRate = "30.00";
    });
    const result = calculatePayPeriod(
      {
        ...input(casual(), [shift("s1", "2027-07-05T09:00", "2027-07-05T13:00")]),
        payPeriod: { startDate: "2027-06-28", endDate: "2027-07-11" },
      },
      draftContext(current, next),
    );
    expect(result.metadata.ruleSetVersion).toBe("MA000004/2026-07-01/r1");
  });

  it("resolves overlapping windows by precedence and records the overridden rule", () => {
    const ruleSet = draftRuleSet((r) => {
      r.version = "MA000004/2026-07-01/r99";
      const evening = r.rateRules.find((x) => x.id === "MA000004.PEN.WEEKDAY_AFTER_6PM")!;
      evening.when = {
        kind: "WEEKLY_WINDOW",
        days: ["MON", "TUE", "WED", "THU", "FRI"],
        from: "17:00",
        to: "21:00",
      };
    });
    const result = calculatePayPeriod(
      input(casual(), [shift("s1", "2026-07-06T16:00", "2026-07-06T19:00")]),
      draftContext(ruleSet),
    );
    expect(
      result.shifts[0]?.segments.map((s) => [
        s.minutes,
        s.classification.kind === "RULE" ? s.classification.ruleId : "",
        s.overriddenRuleIds,
      ]),
    ).toEqual([
      [60, "MA000004.ORD.WEEKDAY", []],
      [60, "MA000004.PEN.WEEKDAY_AFTER_6PM", ["MA000004.ORD.WEEKDAY"]],
      [60, "MA000004.PEN.WEEKDAY_AFTER_6PM", []],
    ]);
  });

  it("supports end-of-day (24:00) windows", () => {
    const ruleSet = draftRuleSet((r) => {
      r.version = "MA000004/2026-07-01/r98";
      const evening = r.rateRules.find((x) => x.id === "MA000004.PEN.WEEKDAY_AFTER_6PM")!;
      evening.when = {
        kind: "WEEKLY_WINDOW",
        days: ["MON", "TUE", "WED", "THU", "FRI"],
        from: "18:00",
        to: "24:00",
      };
    });
    const result = calculatePayPeriod(
      input(casual(), [shift("s1", "2026-07-06T19:00", "2026-07-06T23:59")]),
      draftContext(ruleSet),
    );
    expect(result.status).toBe(CalculationStatus.CALCULATED);
  });
});

describe("determinism and immutability", () => {
  const value = input(casual(), [
    shift("b", "2026-07-11T08:00", "2026-07-11T16:30", ["2026-07-11T12:00", "2026-07-11T12:30"]),
    shift("a", "2026-07-06T09:00", "2026-07-06T17:00"),
  ]);

  it("produces identical output for identical input and context", () => {
    expect(JSON.stringify(calc(value))).toBe(JSON.stringify(calc(structuredClone(value))));
  });

  it("does not mutate its input", () => {
    const frozen = structuredClone(value);
    const deepFreeze = (o: unknown): void => {
      if (o !== null && typeof o === "object") {
        Object.freeze(o);
        Object.values(o).forEach(deepFreeze);
      }
    };
    deepFreeze(frozen);
    expect(() => calc(frozen)).not.toThrow();
    expect(frozen).toEqual(value);
  });

  it("hashes input independently of shift order and key order", () => {
    const reordered = {
      shifts: [...value.shifts].reverse(),
      payPeriod: value.payPeriod,
      employment: value.employment,
    };
    expect(calc(reordered).metadata.inputHash).toBe(calc(value).metadata.inputHash);
    const changed = { ...value, shifts: [shift("a", "2026-07-06T09:00", "2026-07-06T17:01")] };
    expect(calc(changed).metadata.inputHash).not.toBe(calc(value).metadata.inputHash);
  });
});
