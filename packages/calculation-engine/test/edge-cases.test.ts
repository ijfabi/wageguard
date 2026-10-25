import { AwardRuleSetSchema, BUNDLED_RULE_SETS, type WeeklyWindowRule } from "@wageguard/award-rules";
import { describe, expect, it } from "vitest";

import { createPricer, minutesToHours, percentFor } from "../src/pricing.js";
import { parseCalculationInput } from "../src/input.js";
import { calc, casual, input } from "./helpers.js";

const ruleSet = AwardRuleSetSchema.parse(BUNDLED_RULE_SETS[0]);

describe("DST-ambiguous wall-clock times with explicit offsets (daylight saving ends 2026-04-05)", () => {
  // No rule set covers April 2026, so the calculation is UNSUPPORTED, but input resolution still runs.
  const period = { startDate: "2026-03-30", endDate: "2026-04-12" };

  it("accepts offsets on shifts and breaks and measures elapsed time correctly", () => {
    const result = calc({
      employment: casual(),
      payPeriod: period,
      shifts: [
        {
          id: "s1",
          start: "2026-04-05T01:30",
          end: "2026-04-05T02:30",
          endUtcOffsetMinutes: 600, // the second 02:30 (standard time)
          breaks: [
            {
              kind: "UNPAID_MEAL",
              start: "2026-04-05T02:10",
              startUtcOffsetMinutes: 660,
              end: "2026-04-05T02:20",
              endUtcOffsetMinutes: 660,
            },
          ],
        },
        {
          id: "s2",
          start: "2026-04-05T02:45",
          startUtcOffsetMinutes: 600,
          end: "2026-04-05T06:00",
          breaks: [],
        },
      ],
    });
    expect(result.shifts.map((s) => [s.shiftId, s.elapsedMinutes, s.unpaidBreakMinutes])).toEqual([
      ["s1", 120, 10],
      ["s2", 195, 0],
    ]);
    expect(result.status).toBe("UNSUPPORTED_SCENARIO");
  });
});

describe("pricing guards", () => {
  it("rejects a classification missing from the rule set", () => {
    const employment = parseCalculationInput(input(casual(), [])).employment;
    expect(() => createPricer(ruleSet, { ...employment, classificationCode: "NOPE" })).toThrow(
      /missing from rule set/,
    );
  });

  it("rejects a rule without a percentage for the employment type", () => {
    const rule = ruleSet.rateRules[0] as WeeklyWindowRule;
    expect(() => percentFor(rule, "FULL_TIME")).toThrow(/no percentage for FULL_TIME/);
  });

  it("formats minutes as hours to at most 4 decimal places", () => {
    expect(minutesToHours(450)).toBe("7.5");
    expect(minutesToHours(50)).toBe("0.8333");
  });
});
