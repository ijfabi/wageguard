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

type ShiftTimes = Pick<CreateShiftRequest, "start" | "end" | "breaks">;

function nextDay(isoDate: string): string {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** Places a wall-clock time on the shift's start date, or the next day if it is before the start. */
function onShiftDay(date: string, shiftStart: string, time: string): string {
  return `${time < shiftStart ? nextDay(date) : date}T${time}`;
}

export function toShiftTimes(values: ShiftFormValues): ShiftTimes {
  const at = (time: string) => onShiftDay(values.date, values.start, time);
  const breaks: ShiftTimes["breaks"] = [];
  if (values.mealStart !== "" && values.mealEnd !== "") {
    breaks.push({ kind: "UNPAID_MEAL", start: at(values.mealStart), end: at(values.mealEnd) });
  }
  for (const rest of values.restBreaks) {
    breaks.push({ kind: "PAID_REST", start: at(rest.start), end: at(rest.end) });
  }
  return { start: `${values.date}T${values.start}`, end: at(values.end), breaks };
}

/** Pre-fills the form from a stored shift (for editing). */
export function fromShiftResponse(shift: ShiftResponse): ShiftFormValues {
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
  };
}
