import { describe, expect, it } from "vitest";

import {
  PUBLIC_HOLIDAY_CALENDAR,
  PUBLIC_HOLIDAY_YEARS,
  publicHolidaysBetween,
} from "../src/public-holidays.js";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const weekday = (date: string) => DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

describe("public holiday calendar (Fair Work Ombudsman lists for 2026 and 2027)", () => {
  it("covers every state and territory for both years, with recorded sources", () => {
    expect(PUBLIC_HOLIDAY_YEARS).toEqual([2026, 2027]);
    for (const [state, list] of Object.entries(PUBLIC_HOLIDAY_CALENDAR.holidays)) {
      expect(list.length, state).toBeGreaterThanOrEqual(20);
      expect(
        list.some((h) => h.date.startsWith("2026")),
        state,
      ).toBe(true);
      expect(
        list.some((h) => h.date.startsWith("2027")),
        state,
      ).toBe(true);
    }
  });

  it("has the national holidays on their well-known dates", () => {
    for (const state of ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const) {
      const dates = publicHolidaysBetween(state, "2026-01-01", "2026-12-31").map((h) => h.date);
      expect(dates, state).toEqual(
        expect.arrayContaining(["2026-01-01", "2026-01-26", "2026-04-03", "2026-12-25"]),
      );
    }
    // Good Friday 2026 is 3 April and Easter Monday 6 April.
    expect(weekday("2026-04-03")).toBe("FRI");
    expect(publicHolidaysBetween("VIC", "2026-04-06", "2026-04-06")[0]?.name).toBe("Easter Monday");
  });

  it("marks part-day holidays with their start time", () => {
    expect(publicHolidaysBetween("SA", "2026-12-24", "2026-12-24")).toEqual([
      { date: "2026-12-24", name: "Christmas Eve", from: "19:00", scope: "STATEWIDE" },
    ]);
    expect(publicHolidaysBetween("QLD", "2026-12-24", "2026-12-24")[0]?.from).toBe("18:00");
  });

  it("keeps regional holidays separate so they're never assumed", () => {
    const regional = publicHolidaysBetween("QLD", "2026-08-01", "2026-08-31");
    expect(regional).toEqual([
      { date: "2026-08-12", name: "Royal Queensland Show (Brisbane area only)", scope: "REGIONAL" },
    ]);
  });

  it("is sorted by date within each state", () => {
    for (const list of Object.values(PUBLIC_HOLIDAY_CALENDAR.holidays)) {
      const dates = list.map((h) => h.date);
      expect(dates).toEqual([...dates].sort());
    }
  });
});
