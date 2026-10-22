import fc from "fast-check";
import { IANAZone } from "luxon";
import { describe, expect, it } from "vitest";

import { TimeZone } from "../src/index.js";
import { OffsetTable } from "../src/time/offset-table.js";

const ZONES = [
  "Australia/Sydney",
  "Australia/Lord_Howe", // 30-minute DST shift
  "Australia/Adelaide", // +09:30 / +10:30
  "Australia/Perth",
  "Australia/Brisbane",
  "America/New_York",
  "Europe/London",
  "Pacific/Chatham", // +12:45 / +13:45
];
const MIN_MS = Date.UTC(1900, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);

describe("OffsetTable", () => {
  it("property: agrees with the direct Intl-backed lookup at random instants (1900-2100)", () => {
    const tables = new Map(ZONES.map((id) => [id, new OffsetTable((ms) => IANAZone.create(id).offset(ms))]));
    fc.assert(
      fc.property(fc.constantFrom(...ZONES), fc.integer({ min: MIN_MS, max: MAX_MS }), (id, ms) => {
        expect(tables.get(id)!.offsetAt(ms)).toBe(IANAZone.create(id).offset(ms));
      }),
      { numRuns: 5000 },
    );
  });

  it("is exact at the millisecond either side of real transitions", () => {
    const zone = IANAZone.create("Australia/Sydney");
    const table = new OffsetTable((ms) => zone.offset(ms));
    // 2026-10-03T16:00:00Z = 03:00 AEDT (DST starts); 2026-04-04T16:00:00Z = 02:00 AEST (DST ends).
    for (const transition of [Date.UTC(2026, 9, 3, 16), Date.UTC(2026, 3, 4, 16)]) {
      for (const ms of [transition - 1, transition, transition + 1]) {
        expect(table.offsetAt(ms)).toBe(zone.offset(ms));
      }
    }
    const lordHowe = IANAZone.create("Australia/Lord_Howe");
    const lordHoweTable = new OffsetTable((ms) => lordHowe.offset(ms));
    for (let ms = Date.UTC(2026, 9, 3, 14); ms < Date.UTC(2026, 9, 3, 17); ms += 60_000) {
      expect(lordHoweTable.offsetAt(ms)).toBe(lordHowe.offset(ms));
    }
  });

  it("builds each year's table once and reuses it", () => {
    let calls = 0;
    const zone = IANAZone.create("Australia/Sydney");
    const table = new OffsetTable((ms) => {
      calls += 1;
      return zone.offset(ms);
    });
    table.offsetAt(Date.UTC(2026, 6, 6));
    const afterFirst = calls;
    for (let day = 0; day < 365; day += 1) {
      table.offsetAt(Date.UTC(2026, 0, 1) + day * 86_400_000);
    }
    expect(calls).toBe(afterFirst);
  });
});

describe("TimeZone instance cache", () => {
  it("returns the same validated instance for the same id", () => {
    expect(TimeZone.of("Australia/Sydney")).toBe(TimeZone.of("Australia/Sydney"));
  });
});
