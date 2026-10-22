import { comparable, engineLabel, latest, type EngineSizeResult, type LoadedRecord } from "./load.js";
import { improvementPercent, round, throughputIncreasePercent } from "./stats.js";

export interface SizeComparison {
  readonly shifts: number;
  readonly baselineMedianTotalMs: number;
  readonly improvedMedianTotalMs: number;
  /** (baseline - improved) / baseline * 100: lower-is-better measure. */
  readonly medianTotalTimeImprovementPercent: number;
  readonly baselineP95PerPeriodMs: number;
  readonly improvedP95PerPeriodMs: number;
  readonly p95PerPeriodLatencyImprovementPercent: number;
  readonly baselineMedianShiftsPerSecond: number;
  readonly improvedMedianShiftsPerSecond: number;
  /** (improved - baseline) / baseline * 100: higher-is-better measure. */
  readonly medianThroughputIncreasePercent: number;
}

export interface EngineComparison {
  readonly baseline: LoadedRecord;
  readonly improved: LoadedRecord;
  readonly comparable: boolean;
  readonly problems: readonly string[];
  readonly sizes: readonly SizeComparison[];
  readonly equivalence: LoadedRecord | null;
}

/** Benchmark F: latest "baseline" engine run against the latest "optimised*" run. */
export function compareEngineRuns(records: readonly LoadedRecord[]): EngineComparison | null {
  const isEngine = (r: LoadedRecord): boolean =>
    r.benchmark === "A-engine-throughput" && r.status === "COMPLETED";
  const baseline = latest(records, (r) => isEngine(r) && engineLabel(r) === "baseline");
  const improved = latest(records, (r) => isEngine(r) && engineLabel(r).startsWith("optimised"));
  if (baseline === null || improved === null) {
    return null;
  }
  const problems = comparable(baseline, improved);
  const baseSizes = baseline.results as readonly EngineSizeResult[];
  const newSizes = improved.results as readonly EngineSizeResult[];
  const sizes = baseSizes.flatMap((b) => {
    const n = newSizes.find((x) => x.shifts === b.shifts);
    if (n === undefined) {
      return [];
    }
    return [
      {
        shifts: b.shifts,
        baselineMedianTotalMs: round(b.repetitionTotalMs.median, 2),
        improvedMedianTotalMs: round(n.repetitionTotalMs.median, 2),
        medianTotalTimeImprovementPercent: round(
          improvementPercent(b.repetitionTotalMs.median, n.repetitionTotalMs.median),
          1,
        ),
        baselineP95PerPeriodMs: round(b.perPayPeriodMs.p95, 3),
        improvedP95PerPeriodMs: round(n.perPayPeriodMs.p95, 3),
        p95PerPeriodLatencyImprovementPercent: round(
          improvementPercent(b.perPayPeriodMs.p95, n.perPayPeriodMs.p95),
          1,
        ),
        baselineMedianShiftsPerSecond: round(b.shiftsPerSecond.median, 0),
        improvedMedianShiftsPerSecond: round(n.shiftsPerSecond.median, 0),
        medianThroughputIncreasePercent: round(
          throughputIncreasePercent(b.shiftsPerSecond.median, n.shiftsPerSecond.median),
          1,
        ),
      },
    ];
  });
  const equivalence = latest(
    records,
    (r) => r.benchmark === "F-offset-table-equivalence" && r.status === "COMPLETED",
  );
  return { baseline, improved, comparable: problems.length === 0, problems, sizes, equivalence };
}
