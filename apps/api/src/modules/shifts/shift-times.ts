import type { CreateShiftRequest, ShiftResponse } from "@wageguard/api-contracts";
import {
  LocalDateTime,
  TimeZone,
  resolveShift,
  type ResolvedShift,
  type ShiftRecord,
} from "@wageguard/domain";

import type { Shift, ShiftBreak } from "../../generated/prisma/client.js";

export type ShiftTimes = Pick<
  CreateShiftRequest,
  "start" | "end" | "startUtcOffsetMinutes" | "endUtcOffsetMinutes" | "breaks"
>;

/**
 * Validates shift times with the same domain rules the calculation engine uses (DST gaps and
 * repeats, ordering, breaks within the shift, maximum length). Throws DomainValidationError.
 */
export function resolveTimes(times: ShiftTimes, timeZone: string, path = "shift"): ResolvedShift {
  const record: ShiftRecord = {
    id: "pending",
    start: LocalDateTime.parse(times.start, `${path}.start`),
    end: LocalDateTime.parse(times.end, `${path}.end`),
    ...(times.startUtcOffsetMinutes === undefined
      ? {}
      : { startUtcOffsetMinutes: times.startUtcOffsetMinutes }),
    ...(times.endUtcOffsetMinutes === undefined ? {} : { endUtcOffsetMinutes: times.endUtcOffsetMinutes }),
    breaks: times.breaks.map((b, i) => ({
      kind: b.kind,
      start: LocalDateTime.parse(b.start, `${path}.breaks[${i}].start`),
      end: LocalDateTime.parse(b.end, `${path}.breaks[${i}].end`),
      ...(b.startUtcOffsetMinutes === undefined ? {} : { startUtcOffsetMinutes: b.startUtcOffsetMinutes }),
      ...(b.endUtcOffsetMinutes === undefined ? {} : { endUtcOffsetMinutes: b.endUtcOffsetMinutes }),
    })),
  };
  return resolveShift(record, TimeZone.of(timeZone, "employment.timeZone"), path);
}

/** Column values for a validated shift (the local values remain the source of truth). */
export function shiftColumns(times: ShiftTimes, resolved: ResolvedShift) {
  return {
    startLocal: times.start,
    endLocal: times.end,
    startUtcOffsetMinutes: times.startUtcOffsetMinutes ?? null,
    endUtcOffsetMinutes: times.endUtcOffsetMinutes ?? null,
    startDate: localDateColumn(times.start.slice(0, 10)),
    startAt: new Date(resolved.interval.start.epochMs),
    endAt: new Date(resolved.interval.end.epochMs),
  };
}

export function breakColumns(times: ShiftTimes) {
  return times.breaks.map((b, position) => ({
    position,
    kind: b.kind,
    startLocal: b.start,
    endLocal: b.end,
    startUtcOffsetMinutes: b.startUtcOffsetMinutes ?? null,
    endUtcOffsetMinutes: b.endUtcOffsetMinutes ?? null,
  }));
}

/** A PostgreSQL DATE travels through Prisma as UTC midnight. */
export function localDateColumn(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toShiftResponse(shift: Shift & { breaks: ShiftBreak[] }): ShiftResponse {
  return {
    id: shift.id,
    employmentId: shift.employmentId,
    start: shift.startLocal,
    end: shift.endLocal,
    startUtcOffsetMinutes: shift.startUtcOffsetMinutes,
    endUtcOffsetMinutes: shift.endUtcOffsetMinutes,
    startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(),
    breaks: [...shift.breaks]
      .sort((a, b) => a.position - b.position)
      .map((b) => ({
        kind: b.kind,
        start: b.startLocal,
        end: b.endLocal,
        ...(b.startUtcOffsetMinutes === null ? {} : { startUtcOffsetMinutes: b.startUtcOffsetMinutes }),
        ...(b.endUtcOffsetMinutes === null ? {} : { endUtcOffsetMinutes: b.endUtcOffsetMinutes }),
      })),
    version: shift.version,
    createdAt: shift.createdAt.toISOString(),
    updatedAt: shift.updatedAt.toISOString(),
  };
}
