import { IANAZone } from "luxon";

import { DomainError, DomainErrorCode } from "../errors.js";
import { Instant } from "./instant.js";
import { LocalDate } from "./local-date.js";
import { LocalDateTime, LocalTime } from "./local-time.js";
import { OffsetTable } from "./offset-table.js";

const MS_PER_MINUTE = 60_000;
/** Offsets are probed this far either side of a wall-clock time to find every candidate offset. */
const OFFSET_PROBE_MS = 36 * 60 * MS_PER_MINUTE;

/** How to resolve a wall-clock time that occurs twice (DST fall-back) or never (DST spring-forward). */
export const Disambiguation = {
  /** Fail with AMBIGUOUS_LOCAL_TIME / NONEXISTENT_LOCAL_TIME. Used for user-entered shift times. */
  REJECT: "REJECT",
  /**
   * Ambiguous -> the earlier instant; nonexistent -> the first instant after the gap. Used only for
   * rule boundaries (e.g. midnight), never for user input.
   */
  EARLIER: "EARLIER",
} as const;
export type Disambiguation = (typeof Disambiguation)[keyof typeof Disambiguation];

/** An IANA time zone (e.g. "Australia/Sydney"). Never a fixed offset or an abbreviation like "AEST". */
export class TimeZone {
  /** Validated zones are immutable and shared, so validation and offset tables are built once. */
  private static readonly instances = new Map<string, TimeZone>();
  private readonly offsets: OffsetTable;

  private constructor(readonly id: string) {
    const zone = IANAZone.create(id);
    this.offsets = new OffsetTable((epochMs) => zone.offset(epochMs));
  }

  static of(id: string, path?: string): TimeZone {
    const existing = typeof id === "string" ? TimeZone.instances.get(id) : undefined;
    if (existing !== undefined) {
      return existing;
    }
    if (typeof id !== "string" || !id.includes("/") || !IANAZone.isValidZone(id)) {
      throw new DomainError(
        DomainErrorCode.INVALID_TIME_ZONE,
        `Not a supported IANA time zone: ${JSON.stringify(id)}`,
        path,
      );
    }
    const zone = new TimeZone(id);
    TimeZone.instances.set(id, zone);
    return zone;
  }

  /** UTC offset in minutes at the given instant (e.g. +600 for AEST, +660 for AEDT). */
  offsetMinutesAt(instant: Instant): number {
    return this.offsets.offsetAt(instant.epochMs);
  }

  /**
   * Converts a wall-clock time to an instant.
   *
   * @param explicitOffsetMinutes optional UTC offset supplied by the user to disambiguate a repeated
   *   wall-clock time; it must be one of the offsets actually in force at that wall-clock time.
   */
  resolve(
    local: LocalDateTime,
    disambiguation: Disambiguation,
    explicitOffsetMinutes?: number,
    path?: string,
  ): Instant {
    const candidates = this.candidateInstants(local);

    if (explicitOffsetMinutes !== undefined) {
      const match = candidates.find((c) => c.offsetMinutes === explicitOffsetMinutes);
      if (match === undefined) {
        throw new DomainError(
          DomainErrorCode.INVALID_UTC_OFFSET,
          `UTC offset ${explicitOffsetMinutes} min is not valid for ${local.toString()} in ${this.id}`,
          path,
        );
      }
      return match.instant;
    }

    const [first, second] = candidates;
    if (first !== undefined && second === undefined) {
      return first.instant;
    }
    if (first !== undefined) {
      if (disambiguation === Disambiguation.REJECT) {
        throw new DomainError(
          DomainErrorCode.AMBIGUOUS_LOCAL_TIME,
          `${local.toString()} occurs twice in ${this.id} (daylight saving ends); supply the UTC offset`,
          path,
        );
      }
      return first.instant;
    }
    if (disambiguation === Disambiguation.REJECT) {
      throw new DomainError(
        DomainErrorCode.NONEXISTENT_LOCAL_TIME,
        `${local.toString()} does not exist in ${this.id} (daylight saving starts)`,
        path,
      );
    }
    return this.firstInstantAfterGap(local);
  }

  /** Wall-clock date and time of an instant in this zone. */
  toLocal(instant: Instant): LocalDateTime {
    const shifted = new Date(instant.epochMs + this.offsetMinutesAt(instant) * MS_PER_MINUTE);
    const date = LocalDate.of(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
    const time = LocalTime.ofMinuteOfDay(shifted.getUTCHours() * 60 + shifted.getUTCMinutes());
    return LocalDateTime.of(date, time);
  }

  /** The first instant of a local date (local midnight, or the end of a DST gap spanning midnight). */
  startOfDay(date: LocalDate): Instant {
    return this.resolve(LocalDateTime.of(date, LocalTime.ofMinuteOfDay(0)), Disambiguation.EARLIER);
  }

  /** Every instant whose wall-clock reading in this zone equals `local`, sorted ascending. */
  private candidateInstants(local: LocalDateTime): { instant: Instant; offsetMinutes: number }[] {
    const wallAsUtcMs = wallClockAsUtcMs(local);
    const offsets = new Set<number>([
      this.offsets.offsetAt(wallAsUtcMs - OFFSET_PROBE_MS),
      this.offsets.offsetAt(wallAsUtcMs),
      this.offsets.offsetAt(wallAsUtcMs + OFFSET_PROBE_MS),
    ]);
    const result: { instant: Instant; offsetMinutes: number }[] = [];
    for (const offsetMinutes of offsets) {
      const epochMs = wallAsUtcMs - offsetMinutes * MS_PER_MINUTE;
      if (this.offsets.offsetAt(epochMs) === offsetMinutes) {
        result.push({ instant: Instant.ofEpochMs(epochMs), offsetMinutes });
      }
    }
    return result.sort((a, b) => a.instant.epochMs - b.instant.epochMs);
  }

  private firstInstantAfterGap(local: LocalDateTime): Instant {
    // Inside a gap, interpreting the wall time with the pre-transition offset lands after the
    // transition; the transition instant itself is where the new offset begins.
    const wallAsUtcMs = wallClockAsUtcMs(local);
    const before = this.offsets.offsetAt(wallAsUtcMs - OFFSET_PROBE_MS);
    let low = wallAsUtcMs - OFFSET_PROBE_MS;
    let high = wallAsUtcMs + OFFSET_PROBE_MS;
    while (high - low > MS_PER_MINUTE) {
      const mid = low + Math.floor((high - low) / 2 / MS_PER_MINUTE) * MS_PER_MINUTE;
      if (this.offsets.offsetAt(mid) === before) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return Instant.ofEpochMs(high);
  }
}

function wallClockAsUtcMs(local: LocalDateTime): number {
  return (
    Date.UTC(local.date.year, local.date.month - 1, local.date.day) + local.time.minuteOfDay * MS_PER_MINUTE
  );
}
