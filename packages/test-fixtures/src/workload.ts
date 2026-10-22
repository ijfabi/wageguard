import type { PayPeriodCalculationInput, ShiftInput } from "@wageguard/calculation-engine";
import { LocalDate } from "@wageguard/domain";

/**
 * Deterministic synthetic workloads for benchmarks. Same (seed, shiftCount) => byte-identical
 * workload on every machine. Version this generator: changing it invalidates comparisons.
 */
export const WORKLOAD_GENERATOR_VERSION = "1";

const FIRST_PERIOD_START = LocalDate.parse("2026-07-06");
const PERIOD_DAYS = 14;
const SHIFTS_PER_PERIOD = 10;

/** mulberry32: small, fast, well-distributed 32-bit PRNG. Not for security. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");
const at = (date: LocalDate, minuteOfDay: number): string =>
  `${date.toString()}T${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;

/**
 * Generates fortnightly pay periods of 10 shifts each (the last period may have fewer) until
 * `shiftCount` shifts exist. Shifts start between 07:00 and 15:00 and last 3-8 hours, so a realistic
 * mix includes weekday, evening, weekend and some outside-span (review-required) time. Half the
 * periods are casual and half part-time.
 */
export function generateWorkload(seed: number, shiftCount: number): PayPeriodCalculationInput[] {
  const random = mulberry32(seed);
  const int = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));
  const periods: PayPeriodCalculationInput[] = [];

  for (let produced = 0, index = 0; produced < shiftCount; index += 1) {
    const startDate = FIRST_PERIOD_START.plusDays(index * PERIOD_DAYS);
    const count = Math.min(SHIFTS_PER_PERIOD, shiftCount - produced);
    const days = pickDistinctDays(count, int);
    const shifts: ShiftInput[] = days.map((day, n) => {
      const date = startDate.plusDays(day);
      const start = int(7 * 4, 15 * 4) * 15;
      const length = int(3 * 4, 8 * 4) * 15;
      const shift: ShiftInput = {
        id: `p${index}-s${n}`,
        start: at(date, start),
        end: at(date, start + length),
        breaks: [],
      };
      if (length > 5 * 60) {
        const mealStart = start + Math.floor(length / 2 / 15) * 15;
        shift.breaks.push({ kind: "UNPAID_MEAL", start: at(date, mealStart), end: at(date, mealStart + 30) });
      }
      return shift;
    });
    const casual = index % 2 === 0;
    periods.push({
      employment: {
        employmentId: `bench-${index}`,
        awardCode: "MA000004",
        classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
        employmentType: casual ? "CASUAL" : "PART_TIME",
        timeZone: "Australia/Sydney",
        declarations: {
          awardCoverage: "CONFIRMED",
          enterpriseAgreement: "NONE",
          ageBand: "ADULT_21_PLUS",
          shiftworker: "NO",
        },
        ...(casual
          ? {}
          : {
              partTimeGuaranteedMinutes: {
                MON: 540,
                TUE: 540,
                WED: 540,
                THU: 540,
                FRI: 540,
                SAT: 540,
                SUN: 540,
              },
            }),
      },
      payPeriod: { startDate: startDate.toString(), endDate: startDate.plusDays(PERIOD_DAYS - 1).toString() },
      shifts,
    });
    produced += count;
  }
  return periods;
}

function pickDistinctDays(count: number, int: (min: number, max: number) => number): number[] {
  const days = Array.from({ length: PERIOD_DAYS }, (_, i) => i);
  for (let i = days.length - 1; i > 0; i -= 1) {
    const j = int(0, i);
    [days[i], days[j]] = [days[j] as number, days[i] as number];
  }
  return days.slice(0, count).sort((a, b) => a - b);
}

export function countShifts(workload: readonly PayPeriodCalculationInput[]): number {
  return workload.reduce((sum, p) => sum + p.shifts.length, 0);
}
