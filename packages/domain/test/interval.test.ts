import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DomainError, Instant, Interval } from "../src/index.js";

const at = (minute: number): Instant => Instant.ofEpochMs(minute * 60_000);
const iv = (from: number, to: number): Interval => Interval.of(at(from), at(to));

/** Arbitrary valid interval within a 2-day window, minute aligned. */
const intervalArb = fc
  .tuple(fc.integer({ min: 0, max: 2880 }), fc.integer({ min: 1, max: 600 }))
  .map(([start, length]) => iv(start, start + length));

describe("Interval", () => {
  it("rejects zero-length and reversed intervals", () => {
    expect(() => iv(10, 10)).toThrow(DomainError);
    expect(() => iv(10, 5)).toThrow(DomainError);
  });

  it("is half-open: includes start, excludes end", () => {
    const interval = iv(60, 120);
    expect(interval.contains(at(60))).toBe(true);
    expect(interval.contains(at(119))).toBe(true);
    expect(interval.contains(at(120))).toBe(false);
    expect(interval.contains(at(59))).toBe(false);
  });

  it("does not treat touching intervals as overlapping", () => {
    expect(iv(0, 60).overlaps(iv(60, 120))).toBe(false);
    expect(iv(0, 61).overlaps(iv(60, 120))).toBe(true);
    expect(iv(0, 60).intersection(iv(60, 120))).toBeNull();
  });

  it("computes intersections and enclosure", () => {
    expect(iv(0, 100).intersection(iv(50, 150))?.durationMinutes()).toBe(50);
    expect(iv(0, 100).encloses(iv(10, 100))).toBe(true);
    expect(iv(0, 100).encloses(iv(10, 101))).toBe(false);
    expect(JSON.stringify(iv(0, 1))).toBe(
      '{"start":"1970-01-01T00:00:00.000Z","end":"1970-01-01T00:01:00.000Z"}',
    );
  });

  it("subtracts holes, including overlapping, touching and out-of-range holes", () => {
    const pieces = iv(0, 100).subtractAll([iv(40, 50), iv(45, 60), iv(90, 200), iv(-50, -10)]);
    expect(pieces.map((p) => [p.start.epochMs / 60_000, p.end.epochMs / 60_000])).toEqual([
      [0, 40],
      [60, 90],
    ]);
    expect(iv(0, 100).subtractAll([iv(0, 100)])).toEqual([]);
    expect(iv(0, 100).subtractAll([])).toHaveLength(1);
  });

  it("property: subtracting holes leaves non-overlapping pieces whose duration equals base minus covered time", () => {
    fc.assert(
      fc.property(intervalArb, fc.array(intervalArb, { maxLength: 6 }), (base, holes) => {
        const pieces = base.subtractAll(holes);
        // Count covered minutes directly, minute by minute.
        let covered = 0;
        for (let m = base.start.epochMs; m < base.end.epochMs; m += 60_000) {
          if (holes.some((h) => h.contains(Instant.ofEpochMs(m)))) {
            covered += 1;
          }
        }
        const total = pieces.reduce((sum, p) => sum + p.durationMinutes(), 0);
        expect(total).toBe(base.durationMinutes() - covered);
        for (let i = 1; i < pieces.length; i += 1) {
          expect(pieces[i - 1]!.end.isAfter(pieces[i]!.start)).toBe(false);
        }
        for (const piece of pieces) {
          expect(base.encloses(piece)).toBe(true);
          expect(piece.durationMinutes()).toBeGreaterThan(0);
          expect(holes.some((h) => h.overlaps(piece))).toBe(false);
        }
      }),
    );
  });
});
