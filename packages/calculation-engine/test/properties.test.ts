import { Decimal, LocalDate, Money } from "@wageguard/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CalculationStatus,
  type EmploymentInput,
  type PayPeriodCalculationInput,
  type ShiftInput,
} from "../src/index.js";
import { calc, casual, partTime } from "./helpers.js";

const pad = (n: number): string => String(n).padStart(2, "0");
const localAt = (periodStart: LocalDate, minuteOffset: number): string => {
  const date = periodStart.plusDays(Math.floor(minuteOffset / 1440));
  const minute = minuteOffset % 1440;
  return `${date.toString()}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
};

interface ShiftSpec {
  readonly day: number;
  readonly start: number;
  readonly length: number;
  readonly meal: { readonly offset: number; readonly length: number } | null;
}

/**
 * Shifts on even days only (0, 2, ... 12) so that a shift may run past midnight into the
 * following (odd, unused) day without overlapping the next shift.
 */
const shiftSpec = fc
  .record({
    day: fc.integer({ min: 0, max: 6 }).map((n) => n * 2),
    start: fc.integer({ min: 0, max: 23 * 4 }).map((q) => q * 15),
    length: fc.integer({ min: 4, max: 12 * 4 }).map((q) => q * 15),
    meal: fc.option(
      fc.record({
        offsetRatio: fc.double({ min: 0.1, max: 0.7, noNaN: true }),
        length: fc.integer({ min: 30, max: 60 }),
      }),
    ),
  })
  .map(({ day, start, length, meal }): ShiftSpec => {
    if (meal === null || length < 120) {
      return { day, start, length, meal: null };
    }
    // Keep the break strictly inside the shift: at least 15 minutes of work before and after it.
    const mealLength = Math.min(meal.length, length - 90);
    const latestOffset = length - mealLength - 15;
    const offset = 15 + Math.floor(((latestOffset - 15) * meal.offsetRatio) / 5) * 5;
    return { day, start, length, meal: { offset, length: mealLength } };
  });

const shiftsArb = fc.uniqueArray(shiftSpec, { selector: (s) => s.day, maxLength: 7 });

function toInputs(specs: readonly ShiftSpec[], periodStart: LocalDate): ShiftInput[] {
  return specs.map((spec, index) => {
    const startMinute = spec.day * 1440 + spec.start;
    const shift: ShiftInput = {
      id: `s${index}`,
      start: localAt(periodStart, startMinute),
      end: localAt(periodStart, startMinute + spec.length),
      breaks: [],
    };
    if (spec.meal !== null) {
      const mealStart = startMinute + spec.meal.offset;
      shift.breaks.push({
        kind: "UNPAID_MEAL",
        start: localAt(periodStart, mealStart),
        end: localAt(periodStart, mealStart + spec.meal.length),
      });
    }
    return shift;
  });
}

const employmentArb: fc.Arbitrary<EmploymentInput> = fc.oneof(
  fc.constant(casual()),
  fc.constant(partTime({ MON: 480, TUE: 480, WED: 480, THU: 480, FRI: 480, SAT: 480, SUN: 480 })),
);

const JULY = LocalDate.parse("2026-07-06");
const build = (
  employment: EmploymentInput,
  specs: readonly ShiftSpec[],
  start = JULY,
): PayPeriodCalculationInput => ({
  employment,
  payPeriod: { startDate: start.toString(), endDate: start.plusDays(13).toString() },
  shifts: toInputs(specs, start),
});

const expectedPaidMinutes = (specs: readonly ShiftSpec[]): number =>
  specs.reduce((sum, s) => sum + s.length - (s.meal?.length ?? 0), 0);

describe("calculation engine invariants (property-based)", () => {
  it("segmented paid time equals shift time minus unpaid meal breaks, with no overlap or gap", () => {
    fc.assert(
      fc.property(employmentArb, shiftsArb, (employment, specs) => {
        const result = calc(build(employment, specs));
        expect(result.totals.paidMinutes).toBe(expectedPaidMinutes(specs));
        for (const shift of result.shifts) {
          const segmentMinutes = shift.segments.reduce((sum, s) => sum + s.minutes, 0);
          expect(segmentMinutes).toBe(shift.paidMinutes);
          expect(shift.paidMinutes + shift.unpaidBreakMinutes).toBe(shift.elapsedMinutes);
          for (let i = 0; i < shift.segments.length; i += 1) {
            const segment = shift.segments[i]!;
            expect(segment.minutes).toBeGreaterThan(0);
            expect(Date.parse(segment.end) - Date.parse(segment.start)).toBe(segment.minutes * 60_000);
            if (i > 0) {
              expect(Date.parse(shift.segments[i - 1]!.end)).toBeLessThanOrEqual(Date.parse(segment.start));
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("totals are internally consistent and never negative", () => {
    fc.assert(
      fc.property(employmentArb, shiftsArb, (employment, specs) => {
        const result = calc(build(employment, specs));
        const lineTotal = Money.sum(result.lines.map((l) => Money.of(l.amount)));
        expect(lineTotal.toString()).toBe(result.totals.amount);
        expect(Money.of(result.totals.amount).isNegative()).toBe(false);
        expect(result.totals.pricedMinutes + result.totals.unpricedMinutes).toBe(result.totals.paidMinutes);
        expect(result.lines.reduce((sum, l) => sum + l.minutes, 0)).toBe(
          result.shifts
            .filter((s) => s.priced)
            .reduce(
              (sum, s) =>
                sum +
                s.segments.filter((g) => g.classification.kind === "RULE").reduce((n, g) => n + g.minutes, 0),
              0,
            ),
        );
        for (const line of result.lines) {
          // Every line amount is within half a cent of the exact product.
          const exact = new Decimal(line.hourlyRate).times(line.minutes).dividedBy(60);
          expect(exact.minus(line.amount).abs().lessThanOrEqualTo("0.005")).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("a CALCULATED result prices every paid minute; anything else names at least one blocking issue", () => {
    fc.assert(
      fc.property(employmentArb, shiftsArb, (employment, specs) => {
        const result = calc(build(employment, specs));
        if (result.status === CalculationStatus.CALCULATED) {
          expect(result.totals.unpricedMinutes).toBe(0);
          expect(result.shifts.every((s) => s.priced)).toBe(true);
          expect(
            result.shifts.flatMap((s) => s.segments).every((s) => s.classification.kind === "RULE"),
          ).toBe(true);
        } else {
          expect(result.issues.some((i) => i.severity !== "WARNING")).toBe(true);
        }
        // Outside-span or holiday minutes are never priced.
        for (const shift of result.shifts) {
          if (shift.segments.some((s) => s.classification.kind !== "RULE")) {
            expect(shift.priced).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic and independent of shift input order", () => {
    fc.assert(
      fc.property(employmentArb, shiftsArb, fc.integer(), (employment, specs, seed) => {
        const value = build(employment, specs);
        const shuffled = {
          ...value,
          shifts: fc.sample(fc.shuffledSubarray(value.shifts, { minLength: value.shifts.length }), {
            seed,
            numRuns: 1,
          })[0]!,
        };
        const a = JSON.stringify(calc(value));
        expect(JSON.stringify(calc(value))).toBe(a);
        expect(JSON.stringify(calc(shuffled))).toBe(a);
      }),
      { numRuns: 150 },
    );
  });

  it("never prices unsupported or unconfirmed employment", () => {
    const unsupported: fc.Arbitrary<EmploymentInput> = fc.oneof(
      fc.constant(casual({ employmentType: "FULL_TIME" })),
      fc.constant(casual({ classificationCode: "RETAIL_EMPLOYEE_LEVEL_3" })),
      fc
        .constantFrom("APPLIES", "UNSURE")
        .map((v) => casual({ declarations: { ...casual().declarations, enterpriseAgreement: v } })),
      fc
        .constantFrom("UNDER_21", "UNSURE")
        .map((v) => casual({ declarations: { ...casual().declarations, ageBand: v } })),
      fc
        .constantFrom("YES", "UNSURE")
        .map((v) => casual({ declarations: { ...casual().declarations, shiftworker: v } })),
      fc.constant(casual({ declarations: { ...casual().declarations, awardCoverage: "UNSURE" } })),
    );
    fc.assert(
      fc.property(unsupported, shiftsArb, (employment, specs) => {
        const result = calc(build(employment, specs));
        expect(result.status).not.toBe(CalculationStatus.CALCULATED);
        expect(result.lines).toEqual([]);
        expect(result.totals.amount).toBe("0.00");
        expect(result.shifts.every((s) => !s.priced && s.indicativeAmount === null)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("handles a pay period containing the DST start (2026-10-04) without losing or inventing minutes", () => {
    const dstStart = LocalDate.parse("2026-09-28");
    const inGap = (iso: string): boolean => iso >= "2026-10-04T02:00" && iso < "2026-10-04T03:00";
    fc.assert(
      fc.property(shiftsArb, (specs) => {
        const value = build(casual(), specs, dstStart);
        fc.pre(
          !value.shifts.some(
            (s) => inGap(s.start) || inGap(s.end) || s.breaks.some((b) => inGap(b.start) || inGap(b.end)),
          ),
        );
        const result = calc(value);
        for (const shift of result.shifts) {
          const wallClockMinutes =
            (Date.parse(`${shift.localEnd}:00Z`) - Date.parse(`${shift.localStart}:00Z`)) / 60_000;
          const crossesGap = shift.localStart < "2026-10-04T02:00" && shift.localEnd >= "2026-10-04T03:00";
          expect(shift.elapsedMinutes).toBe(crossesGap ? wallClockMinutes - 60 : wallClockMinutes);
          expect(shift.segments.reduce((sum, s) => sum + s.minutes, 0)).toBe(shift.paidMinutes);
        }
      }),
      { numRuns: 300 },
    );
  });
});
