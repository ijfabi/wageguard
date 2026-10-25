import type { CreateShiftRequest, ShiftResponse } from "@wageguard/api-contracts";
import { z } from "zod";

/**
 * The shift form collects a date and wall-clock times, the way a timesheet does. This module turns
 * that into the API's local date-time strings, rolling times that are earlier than the start onto
 * the next day (cross-midnight shifts). It is pure so it can be unit tested.
 */
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const optionalTime = z.union([TIME, z.literal("")]);

export const ShiftFormSchema = z
  .object({
    employmentId: z.uuid("Choose an employment"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date the shift started"),
    start: TIME,
    end: TIME,
    mealStart: optionalTime,
    mealEnd: optionalTime,
    restBreaks: z.array(z.object({ start: TIME, end: TIME })).max(4),
    /**
     * When the clocks go back an hour, times in that hour happen twice. "EARLIER" is the first
     * occurrence (still on daylight time), "LATER" the second. Empty when the time isn't ambiguous.
     */
    startOccurrence: z.enum(["", "EARLIER", "LATER"]),
    endOccurrence: z.enum(["", "EARLIER", "LATER"]),
  })
  .superRefine((value, ctx) => {
    if (value.start === value.end) {
      ctx.addIssue({ code: "custom", message: "The shift must end after it starts", path: ["end"] });
    }
    if ((value.mealStart === "") !== (value.mealEnd === "")) {
      ctx.addIssue({
        code: "custom",
        message: "Enter both the start and end of the meal break",
        path: ["mealEnd"],
      });
    }
  });

export type ShiftFormValues = z.infer<typeof ShiftFormSchema>;

type ShiftTimes = Pick<
  CreateShiftRequest,
  "start" | "end" | "breaks" | "startUtcOffsetMinutes" | "endUtcOffsetMinutes"
>;

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's UTC offset in minutes at an instant, from the browser's time zone data. */
export function utcOffsetAt(timeZone: string, epochMs: number): number {
  let format = offsetFormatters.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    offsetFormatters.set(timeZone, format);
  }
  const name = format.formatToParts(new Date(epochMs)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return match === null ? 0 : (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * The two UTC offsets a local time could have when it falls in the repeated hour as daylight saving
 * ends, earlier occurrence first (for example [660, 600] in Sydney), or null when it happens once.
 */
export function ambiguousOffsets(timeZone: string, localDateTime: string): [number, number] | null {
  const asUtc = Date.parse(`${localDateTime}:00Z`);
  if (Number.isNaN(asUtc)) {
    return null;
  }
  const day = 86_400_000;
  const candidates = [...new Set([utcOffsetAt(timeZone, asUtc - day), utcOffsetAt(timeZone, asUtc + day)])];
  const valid = candidates.filter((offset) => utcOffsetAt(timeZone, asUtc - offset * 60_000) === offset);
  if (valid.length < 2) {
    return null;
  }
  const [a = 0, b = 0] = valid;
  return [Math.max(a, b), Math.min(a, b)];
}

function nextDay(isoDate: string): string {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** Places a wall-clock time on the shift's start date, or the next day if it is before the start. */
function onShiftDay(date: string, shiftStart: string, time: string): string {
  return `${time < shiftStart ? nextDay(date) : date}T${time}`;
}

/** Form values -> API times. The time zone is needed only to resolve the repeated daylight-saving hour. */
export function toShiftTimes(values: ShiftFormValues, timeZone?: string): ShiftTimes {
  const at = (time: string) => onShiftDay(values.date, values.start, time);
  const offsetFor = (local: string, occurrence: ShiftFormValues["startOccurrence"]) => {
    const offsets = timeZone === undefined || occurrence === "" ? null : ambiguousOffsets(timeZone, local);
    return offsets === null ? undefined : occurrence === "EARLIER" ? offsets[0] : offsets[1];
  };
  const start = `${values.date}T${values.start}`;
  const end = at(values.end);
  const startOffset = offsetFor(start, values.startOccurrence);
  const endOffset = offsetFor(end, values.endOccurrence);
  const breaks: ShiftTimes["breaks"] = [];
  if (values.mealStart !== "" && values.mealEnd !== "") {
    breaks.push({ kind: "UNPAID_MEAL", start: at(values.mealStart), end: at(values.mealEnd) });
  }
  for (const rest of values.restBreaks) {
    breaks.push({ kind: "PAID_REST", start: at(rest.start), end: at(rest.end) });
  }
  return {
    start,
    end,
    breaks,
    ...(startOffset === undefined ? {} : { startUtcOffsetMinutes: startOffset }),
    ...(endOffset === undefined ? {} : { endUtcOffsetMinutes: endOffset }),
  };
}

function occurrenceOf(
  timeZone: string | undefined,
  local: string,
  offset: number | null,
): ShiftFormValues["startOccurrence"] {
  const offsets =
    timeZone === undefined || offset === null ? null : ambiguousOffsets(timeZone, local.slice(0, 16));
  return offsets === null ? "" : offset === offsets[0] ? "EARLIER" : "LATER";
}

/** Pre-fills the form from a stored shift (for editing). */
export function fromShiftResponse(shift: ShiftResponse, timeZone?: string): ShiftFormValues {
  const meal = shift.breaks.find((b) => b.kind === "UNPAID_MEAL");
  return {
    employmentId: shift.employmentId,
    date: shift.start.slice(0, 10),
    start: shift.start.slice(11, 16),
    end: shift.end.slice(11, 16),
    mealStart: meal?.start.slice(11, 16) ?? "",
    mealEnd: meal?.end.slice(11, 16) ?? "",
    restBreaks: shift.breaks
      .filter((b) => b.kind === "PAID_REST")
      .map((b) => ({ start: b.start.slice(11, 16), end: b.end.slice(11, 16) })),
    startOccurrence: occurrenceOf(timeZone, shift.start, shift.startUtcOffsetMinutes),
    endOccurrence: occurrenceOf(timeZone, shift.end, shift.endUtcOffsetMinutes),
  };
}
