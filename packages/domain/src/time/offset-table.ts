const MS_PER_DAY = 86_400_000;

interface Transition {
  /** First epoch millisecond at which `offsetMinutes` applies. */
  readonly atMs: number;
  readonly offsetMinutes: number;
}

interface YearTable {
  readonly startOffsetMinutes: number;
  /** Ascending. Australian zones have at most two per year. */
  readonly transitions: readonly Transition[];
}

/**
 * Memoises a time zone's UTC offset function as per-UTC-year transition tables.
 *
 * Why: the underlying offset lookup (Intl.DateTimeFormat#formatToParts via Luxon) dominated
 * calculation-engine CPU time in profiling (about 66% inclusive; see docs/performance.md). Offsets are
 * piecewise constant, so after building a year's table once (one probe per day plus a binary search
 * per transition) every lookup is a short array scan with no Intl call.
 *
 * Assumption (verified by property tests against the direct lookup): a zone changes offset at most
 * once in any 24-hour window. Every IANA zone in practical use satisfies this.
 *
 * What is cached is time-zone rule data (tzdata), which is fixed for the life of the process; no
 * calculation input is cached.
 */
export class OffsetTable {
  private readonly years = new Map<number, YearTable>();

  constructor(private readonly lookup: (epochMs: number) => number) {}

  offsetAt(epochMs: number): number {
    const year = new Date(epochMs).getUTCFullYear();
    const table = this.yearTable(year);
    let offset = table.startOffsetMinutes;
    for (const transition of table.transitions) {
      if (transition.atMs > epochMs) {
        break;
      }
      offset = transition.offsetMinutes;
    }
    return offset;
  }

  private yearTable(year: number): YearTable {
    const cached = this.years.get(year);
    if (cached !== undefined) {
      return cached;
    }
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    const startOffsetMinutes = this.lookup(start);
    const transitions: Transition[] = [];
    let previousMs = start;
    let previousOffset = startOffsetMinutes;
    for (let probe = start + MS_PER_DAY; previousMs < end; probe += MS_PER_DAY) {
      const at = Math.min(probe, end - 1);
      const offset = this.lookup(at);
      if (offset !== previousOffset) {
        transitions.push({ atMs: this.firstMsWithOffset(previousMs, at, offset), offsetMinutes: offset });
        previousOffset = offset;
      }
      previousMs = at + 1;
    }
    const table = { startOffsetMinutes, transitions };
    this.years.set(year, table);
    return table;
  }

  /** Smallest ms in (low, high] whose offset is `offset`, given lookup(high) === offset. */
  private firstMsWithOffset(low: number, high: number, offset: number): number {
    let lo = low - 1;
    let hi = high;
    while (hi - lo > 1) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (this.lookup(mid) === offset) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }
}
