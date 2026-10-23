/**
 * Date and duration display. Wall-clock values from the API ("2026-07-06", "2026-07-06T09:00")
 * are formatted by string manipulation, never through `Date`, so the viewer's time zone cannot
 * shift a shift's date or time.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parts(isoDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match === null) {
    throw new Error(`Not a date: ${isoDate}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Weekday of a calendar date (proleptic Gregorian, independent of time zones). */
export function weekdayOf(isoDate: string): (typeof WEEKDAYS)[number] {
  const { year, month, day } = parts(isoDate);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as (typeof WEEKDAYS)[number];
}

/** "2026-07-06" -> "Mon 6 Jul 2026" */
export function formatDate(isoDate: string): string {
  const { year, month, day } = parts(isoDate);
  return `${weekdayOf(isoDate)} ${day} ${MONTHS[month - 1] ?? ""} ${year}`;
}

/** "09:00" -> "9:00 am", "18:30" -> "6:30 pm" */
export function formatTime(hhmm: string): string {
  const [h = "0", m = "00"] = hhmm.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

/** "2026-07-06T09:00" -> "Mon 6 Jul 2026, 9:00 am" */
export function formatLocalDateTime(value: string): string {
  return `${formatDate(value.slice(0, 10))}, ${formatTime(value.slice(11, 16))}`;
}

/** A shift's span, collapsing the date when start and end fall on the same day. */
export function formatShiftSpan(start: string, end: string): string {
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return sameDay
    ? `${formatDate(start.slice(0, 10))}, ${formatTime(start.slice(11, 16))} – ${formatTime(end.slice(11, 16))}`
    : `${formatLocalDateTime(start)} – ${formatLocalDateTime(end)}`;
}

/** 450 -> "7h 30m", 60 -> "1h", 25 -> "25m" */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "2026-07" -> "Jul 2026" */
export function formatMonth(yyyyMm: string): string {
  const [year = "", month = "1"] = yyyyMm.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** A UTC instant shown in the viewer's locale and zone (used only for record timestamps). */
export function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Shortens long identifiers (hashes, fingerprints) for display. */
export function shortHash(value: string, length = 12): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}
