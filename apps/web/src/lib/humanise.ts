import { formatShiftSpan } from "./format";

/**
 * Engine messages identify shifts by id ("Shift 01a1… has 60 paid minutes…"). For people, replace
 * each known shift id with the shift's local date and times; unknown ids are left unchanged.
 */
export function humaniseShiftIds(
  text: string,
  shifts: readonly { shiftId: string; localStart: string; localEnd: string }[],
): string {
  return shifts.reduce(
    (result, shift) =>
      result.replaceAll(shift.shiftId, `(${formatShiftSpan(shift.localStart, shift.localEnd)})`),
    text,
  );
}
