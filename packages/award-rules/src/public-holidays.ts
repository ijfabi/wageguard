import { z } from "zod";

import calendarData from "./data/public-holidays/AU-2026-2027.json" with { type: "json" };

export const AustralianStateSchema = z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]);
export type AustralianState = z.infer<typeof AustralianStateSchema>;

const PublicHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  /** Part-day holidays (Christmas Eve and New Year's Eve in some states) start at this local time. */
  from: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  /**
   * STATEWIDE holidays apply everywhere in the state. REGIONAL ones (show days, regattas, holidays
   * some regions move to another date) apply only in some areas, so they are offered, not assumed.
   */
  scope: z.enum(["STATEWIDE", "REGIONAL"]),
});

const CalendarSchema = z.object({
  sources: z
    .array(
      z.object({
        year: z.number().int(),
        url: z.url(),
        retrievedOn: z.string(),
        sha256: z.string().length(64),
      }),
    )
    .min(1),
  holidays: z.record(AustralianStateSchema, z.array(PublicHolidaySchema)),
});

export type PublicHoliday = z.infer<typeof PublicHolidaySchema>;

/**
 * State and territory public holidays for 2026 and 2027, as listed by the Fair Work Ombudsman
 * (retrieved 25 October 2026; the source pages' hashes are recorded with the data). The FWO lists
 * state-wide, capital-city and some regional holidays; other local holidays must be added by hand.
 */
export const PUBLIC_HOLIDAY_CALENDAR = CalendarSchema.parse(calendarData);

/** Years the calendar covers. Pay periods outside them get no automatic holidays. */
export const PUBLIC_HOLIDAY_YEARS: readonly number[] = PUBLIC_HOLIDAY_CALENDAR.sources.map((s) => s.year);

/** The listed holidays for a state between two dates (inclusive, YYYY-MM-DD). */
export function publicHolidaysBetween(state: AustralianState, from: string, to: string): PublicHoliday[] {
  return PUBLIC_HOLIDAY_CALENDAR.holidays[state].filter((h) => h.date >= from && h.date <= to);
}

/** The usual time zone for a state, as a starting point when choosing one. */
export const STATE_TIME_ZONES: Readonly<Record<AustralianState, string>> = {
  ACT: "Australia/Sydney",
  NSW: "Australia/Sydney",
  NT: "Australia/Darwin",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  TAS: "Australia/Hobart",
  VIC: "Australia/Melbourne",
  WA: "Australia/Perth",
};
