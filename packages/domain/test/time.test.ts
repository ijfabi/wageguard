import { describe, expect, it } from "vitest";

import {
  Disambiguation,
  DomainError,
  DomainErrorCode,
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  TimeZone,
} from "../src/index.js";

const sydney = TimeZone.of("Australia/Sydney");
const ldt = (value: string): LocalDateTime => LocalDateTime.parse(value);
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error: unknown) {
    return error instanceof DomainError ? error.code : "UNEXPECTED";
  }
  return undefined;
};

describe("LocalDate", () => {
  it("parses, formats and computes weekdays", () => {
    const date = LocalDate.parse("2026-07-06");
    expect(date.toString()).toBe("2026-07-06");
    expect(date.weekday()).toBe("MON");
    expect(LocalDate.parse("2026-07-11").weekday()).toBe("SAT");
    expect(LocalDate.parse("2026-07-12").weekday()).toBe("SUN");
    expect(LocalDate.parse("1969-12-31").weekday()).toBe("WED");
  });

  it("handles month and leap-year boundaries", () => {
    expect(LocalDate.parse("2028-02-28").plusDays(1).toString()).toBe("2028-02-29");
    expect(LocalDate.parse("2026-12-31").plusDays(1).toString()).toBe("2027-01-01");
    expect(LocalDate.parse("2026-07-01").daysUntil(LocalDate.parse("2026-07-14"))).toBe(13);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-00-10", "2026-7-1", "20260701", "1899-12-31", ""])(
    "rejects %j",
    (value) => {
      expect(codeOf(() => LocalDate.parse(value))).toBe(DomainErrorCode.INVALID_LOCAL_DATE);
    },
  );

  it("compares dates", () => {
    const a = LocalDate.parse("2026-07-01");
    const b = LocalDate.parse("2026-07-02");
    expect(a.isBefore(b)).toBe(true);
    expect(b.isAfter(a)).toBe(true);
    expect(a.equals(LocalDate.parse("2026-07-01"))).toBe(true);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(JSON.stringify(a)).toBe('"2026-07-01"');
  });
});

describe("LocalTime and LocalDateTime", () => {
  it("parses minute-precision times", () => {
    expect(LocalTime.parse("18:00").minuteOfDay).toBe(1080);
    expect(LocalTime.parse("00:00").toString()).toBe("00:00");
    expect(LocalTime.parse("24:00", undefined, { allowEndOfDay: true }).minuteOfDay).toBe(1440);
    expect(JSON.stringify(LocalTime.parse("07:05"))).toBe('"07:05"');
  });

  it.each(["24:00", "23:60", "7:00", "07:00:00", "ab:cd"])("rejects time %j", (value) => {
    expect(codeOf(() => LocalTime.parse(value))).toBe(DomainErrorCode.INVALID_LOCAL_TIME);
  });

  it("rejects out-of-range minute-of-day values", () => {
    expect(codeOf(() => LocalTime.ofMinuteOfDay(1441))).toBe(DomainErrorCode.INVALID_LOCAL_TIME);
    expect(codeOf(() => LocalTime.ofMinuteOfDay(1.5))).toBe(DomainErrorCode.INVALID_LOCAL_TIME);
  });

  it("parses date-times and rejects seconds or offsets", () => {
    expect(ldt("2026-07-06T09:30").toString()).toBe("2026-07-06T09:30");
    expect(JSON.stringify(ldt("2026-07-06T09:30"))).toBe('"2026-07-06T09:30"');
    for (const bad of ["2026-07-06T09:30:00", "2026-07-06T09:30Z", "2026-07-06 09:30"]) {
      expect(codeOf(() => ldt(bad))).toBe(DomainErrorCode.INVALID_LOCAL_DATE_TIME);
    }
  });
});

describe("Instant", () => {
  it("parses ISO instants with an explicit offset only", () => {
    expect(Instant.parse("2026-07-06T00:00:00Z").toString()).toBe("2026-07-06T00:00:00.000Z");
    expect(Instant.parse("2026-07-06T10:00:00+10:00").toString()).toBe("2026-07-06T00:00:00.000Z");
    expect(codeOf(() => Instant.parse("2026-07-06T00:00:00"))).toBe(DomainErrorCode.INVALID_INTERVAL);
    expect(codeOf(() => Instant.parse("garbage"))).toBe(DomainErrorCode.INVALID_INTERVAL);
    expect(codeOf(() => Instant.ofEpochMs(1.5))).toBe(DomainErrorCode.INVALID_INTERVAL);
  });

  it("does minute arithmetic and comparisons", () => {
    const a = Instant.ofEpochMs(0);
    const b = a.plusMinutes(90);
    expect(a.minutesUntil(b)).toBe(90);
    expect(a.isBefore(b) && b.isAfter(a)).toBe(true);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.equals(Instant.ofEpochMs(0))).toBe(true);
    expect(Instant.ofEpochMs(30_000).isMinuteAligned()).toBe(false);
    expect(JSON.stringify(a)).toBe('"1970-01-01T00:00:00.000Z"');
  });
});

describe("TimeZone (Australia/Sydney)", () => {
  it("rejects invalid or non-IANA zone identifiers", () => {
    for (const bad of ["AEST", "UTC+10", "Mars/Olympus", "", "+10:00"]) {
      expect(codeOf(() => TimeZone.of(bad))).toBe(DomainErrorCode.INVALID_TIME_ZONE);
    }
  });

  it("resolves standard and daylight time offsets", () => {
    const winter = sydney.resolve(ldt("2026-07-06T09:00"), Disambiguation.REJECT);
    expect(winter.toString()).toBe("2026-07-05T23:00:00.000Z");
    expect(sydney.offsetMinutesAt(winter)).toBe(600);
    const summer = sydney.resolve(ldt("2026-12-07T09:00"), Disambiguation.REJECT);
    expect(summer.toString()).toBe("2026-12-06T22:00:00.000Z");
    expect(sydney.offsetMinutesAt(summer)).toBe(660);
  });

  it("round-trips instants to local date-times", () => {
    const instant = Instant.parse("2026-07-05T23:00:00Z");
    expect(sydney.toLocal(instant).toString()).toBe("2026-07-06T09:00");
  });

  describe("daylight saving starts 2026-10-04 (02:00 -> 03:00)", () => {
    it("rejects a wall-clock time inside the gap", () => {
      expect(codeOf(() => sydney.resolve(ldt("2026-10-04T02:30"), Disambiguation.REJECT))).toBe(
        DomainErrorCode.NONEXISTENT_LOCAL_TIME,
      );
    });

    it("maps a gap time to the end of the gap when EARLIER disambiguation is requested (rule boundaries only)", () => {
      const resolved = sydney.resolve(ldt("2026-10-04T02:30"), Disambiguation.EARLIER);
      expect(sydney.toLocal(resolved).toString()).toBe("2026-10-04T03:00");
    });

    it("has a 23-hour local day", () => {
      const day = LocalDate.parse("2026-10-04");
      expect(sydney.startOfDay(day).minutesUntil(sydney.startOfDay(day.plusDays(1)))).toBe(23 * 60);
    });
  });

  describe("daylight saving ends 2026-04-05 (03:00 -> 02:00)", () => {
    it("rejects an ambiguous wall-clock time without an offset", () => {
      expect(codeOf(() => sydney.resolve(ldt("2026-04-05T02:30"), Disambiguation.REJECT))).toBe(
        DomainErrorCode.AMBIGUOUS_LOCAL_TIME,
      );
    });

    it("accepts an explicit offset to pick either occurrence", () => {
      const first = sydney.resolve(ldt("2026-04-05T02:30"), Disambiguation.REJECT, 660);
      const second = sydney.resolve(ldt("2026-04-05T02:30"), Disambiguation.REJECT, 600);
      expect(first.minutesUntil(second)).toBe(60);
    });

    it("rejects an offset that is not in force at that wall-clock time", () => {
      expect(codeOf(() => sydney.resolve(ldt("2026-04-05T02:30"), Disambiguation.REJECT, 570))).toBe(
        DomainErrorCode.INVALID_UTC_OFFSET,
      );
    });

    it("picks the earlier occurrence for EARLIER disambiguation", () => {
      const earlier = sydney.resolve(ldt("2026-04-05T02:30"), Disambiguation.EARLIER);
      expect(sydney.offsetMinutesAt(earlier)).toBe(660);
    });

    it("has a 25-hour local day", () => {
      const day = LocalDate.parse("2026-04-05");
      expect(sydney.startOfDay(day).minutesUntil(sydney.startOfDay(day.plusDays(1)))).toBe(25 * 60);
    });
  });
});
