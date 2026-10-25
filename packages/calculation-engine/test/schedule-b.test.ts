import { readFileSync } from "node:fs";

import { AwardRuleSetSchema, bundledRegistry } from "@wageguard/award-rules";
import { LocalDate } from "@wageguard/domain";
import { describe, expect, it } from "vitest";

import { parseCalculationInput } from "../src/input.js";
import { createPricer } from "../src/pricing.js";
import { casual, input } from "./helpers.js";

/**
 * Schedule B of MA000004 (consolidated to 1 July 2026) lists every hourly rate the award produces:
 * adult and junior, full-time/part-time and casual, ordinary, penalty, shiftwork and overtime.
 * The fixture is those tables as published (B.1 to B.3). Every value must come out of the engine's
 * own base-rate and rounding code exactly.
 */
interface Section {
  readonly section: string;
  readonly title: string;
  readonly percents: readonly string[];
  readonly rows: readonly {
    readonly level: number;
    readonly age: string | null;
    readonly rates: readonly string[];
  }[];
}
const SCHEDULE_B = JSON.parse(
  readFileSync(new URL("./fixtures/schedule-b-MA000004-2026-07-01.json", import.meta.url), "utf8"),
) as Section[];

const ruleSet = AwardRuleSetSchema.parse(bundledRegistry().get("MA000004/2026-07-01/r2")?.ruleSet);
const ON = LocalDate.parse("2026-07-07");

/** A date of birth (and start date for 20-year-olds) that puts the employee in the row's age band on ON. */
function ageFacts(age: string | null): { dateOfBirth?: string; employmentStartDate?: string } {
  if (age === null) {
    return {};
  }
  const years = age.startsWith("Under 16") ? 15 : Number(/^(\d+)/.exec(age)?.[1]);
  const dateOfBirth = `${2026 - years - 1}-12-01`;
  if (years !== 20) {
    return { dateOfBirth };
  }
  return { dateOfBirth, employmentStartDate: /6 months or less/.test(age) ? "2026-05-01" : "2025-01-01" };
}

describe("every rate published in Schedule B.1 to B.3", () => {
  const cases = SCHEDULE_B.flatMap((s) =>
    s.rows.flatMap((row) =>
      row.rates.map((rate, i) => ({ section: s.section, row, percent: s.percents[i]!, rate })),
    ),
  );

  it("has the expected number of published rates", () => {
    expect(cases).toHaveLength(754);
  });

  it("is reproduced exactly by the base rate (adult or junior) and percentage rounding", () => {
    const mismatches = cases.flatMap(({ section, row, percent, rate }) => {
      const employment = parseCalculationInput(
        input(
          casual({
            classificationCode: `RETAIL_EMPLOYEE_LEVEL_${row.level}`,
            ...ageFacts(row.age),
          }),
          [],
        ),
      ).employment;
      const pricer = createPricer(ruleSet, employment);
      const got = pricer.percentOf(pricer.baseOn(ON), percent).toString();
      return got === rate
        ? []
        : [`${section} L${row.level} ${row.age ?? "adult"} ${percent}%: ${got} != ${rate}`];
    });
    expect(mismatches).toEqual([]);
  });
});

describe("rule percentages match the Schedule B column headings", () => {
  const percent = (id: string, type: "PART_TIME" | "CASUAL") =>
    ruleSet.rateRules.find((r) => r.id === id)?.percentOfMinimumHourlyRate[type];
  const columns = (section: string) => SCHEDULE_B.find((s) => s.section === section)?.percents;

  it.each([
    ["B.1.1", "PART_TIME"],
    ["B.2.1", "CASUAL"],
  ] as const)("%s ordinary and penalty rates (%s)", (section, type) => {
    expect(
      [
        "MA000004.ORD.WEEKDAY",
        "MA000004.PEN.WEEKDAY_AFTER_6PM",
        "MA000004.PEN.SATURDAY",
        "MA000004.PEN.SUNDAY",
        "MA000004.PH.ALL_ORDINARY",
      ].map((id) => percent(id, type)),
    ).toEqual(columns(section));
  });

  it("B.1.3 overtime rates (full-time and part-time)", () => {
    expect(
      [
        "MA000004.OT.MON_SAT_FIRST_3H",
        "MA000004.OT.MON_SAT_AFTER_3H",
        "MA000004.OT.SUNDAY",
        "MA000004.OT.PUBLIC_HOLIDAY",
      ].map((id) => percent(id, "PART_TIME")),
    ).toEqual(columns("B.1.3"));
  });

  it.each([
    ["B.1.2", "PART_TIME"],
    ["B.2.2", "CASUAL"],
  ] as const)("%s shiftwork rates, other than baking production (%s)", (section, type) => {
    // Columns: Mon-Fri, early morning (baking), night (baking), Saturday, Sunday, public holiday.
    const [weekday, , , saturday, sunday, holiday] = columns(section) ?? [];
    expect(
      [
        "MA000004.SHIFT.MON_FRI",
        "MA000004.SHIFT.SATURDAY",
        "MA000004.SHIFT.SUNDAY",
        "MA000004.PH.ALL_ORDINARY",
      ].map((id) => percent(id, type)),
    ).toEqual([weekday, saturday, sunday, holiday]);
  });
});
