/**
 * Comparisons for Benchmarks B (API), C (database) and E (reliability), read from saved records.
 * Runs are paired by their configuration label ("baseline" versus the latest other label), and
 * only completed runs are used. Nothing here measures; it only reads and compares.
 */
import type { LoadedRecord } from "./load.js";
import { improvementPercent, round, type Distribution } from "./stats.js";

function labelOf(r: LoadedRecord): string {
  const label = (r.configuration as { label?: unknown }).label;
  return typeof label === "string" ? label : "unlabelled";
}

function pair(
  records: readonly LoadedRecord[],
  prefix: string,
): { baseline: LoadedRecord; improved: LoadedRecord } | null {
  const runs = records
    .filter((r) => r.benchmark.startsWith(prefix) && r.status === "COMPLETED")
    .sort((a, b) => a.environment.timestampUtc.localeCompare(b.environment.timestampUtc));
  const baseline = runs.filter((r) => labelOf(r) === "baseline").at(-1);
  const improved = runs.filter((r) => labelOf(r) !== "baseline").at(-1);
  return baseline === undefined || improved === undefined ? null : { baseline, improved };
}

// ---------------------------------------------------------------------------------------------
// B: API
// ---------------------------------------------------------------------------------------------

interface ApiLevel {
  readonly concurrentClients: number;
  readonly throughputRps: number;
  readonly errorRatePercent: number;
  readonly successfulCompletionPercent: number;
  readonly latencyMs: Distribution;
}

export interface ApiComparisonRow {
  readonly clients: number;
  readonly baselineRps: number;
  readonly improvedRps: number;
  readonly throughputIncreasePercent: number;
  readonly baselineP95Ms: number;
  readonly improvedP95Ms: number;
  readonly p95ReductionPercent: number;
  readonly baselineP99Ms: number;
  readonly improvedP99Ms: number;
  readonly errorRatePercent: number;
}

export function apiComparison(records: readonly LoadedRecord[]) {
  const runs = pair(records, "Benchmark B");
  if (runs === null) {
    return null;
  }
  const levels = (r: LoadedRecord) => (r.results as { levels: ApiLevel[] }).levels;
  const rows: ApiComparisonRow[] = levels(runs.baseline).flatMap((b) => {
    const i = levels(runs.improved).find((l) => l.concurrentClients === b.concurrentClients);
    return i === undefined
      ? []
      : [
          {
            clients: b.concurrentClients,
            baselineRps: b.throughputRps,
            improvedRps: i.throughputRps,
            throughputIncreasePercent: round(
              ((i.throughputRps - b.throughputRps) / b.throughputRps) * 100,
              1,
            ),
            baselineP95Ms: round(b.latencyMs.p95, 1),
            improvedP95Ms: round(i.latencyMs.p95, 1),
            p95ReductionPercent: round(improvementPercent(b.latencyMs.p95, i.latencyMs.p95), 1),
            baselineP99Ms: round(b.latencyMs.p99, 1),
            improvedP99Ms: round(i.latencyMs.p99, 1),
            errorRatePercent: Math.max(b.errorRatePercent, i.errorRatePercent),
          },
        ];
  });
  const config = (r: LoadedRecord) => r.configuration as Record<string, unknown>;
  const sameWorkload = ["levels", "warmupSeconds", "measuredSeconds", "requestMix", "accounts"].every(
    (k) => JSON.stringify(config(runs.baseline)[k]) === JSON.stringify(config(runs.improved)[k]),
  );
  return { ...runs, rows, sameWorkload };
}

// ---------------------------------------------------------------------------------------------
// C: database
// ---------------------------------------------------------------------------------------------

interface DbOperation {
  readonly operation: string;
  readonly latencyMs: Distribution;
  readonly queryCount: number;
  readonly plans: readonly { sequentialScans: readonly { relation: string }[] }[];
}

interface DbStep {
  readonly measuredUserAudits: number;
  readonly rows: { audits: number };
  readonly operations: readonly DbOperation[];
}

export interface DbComparisonRow {
  readonly operation: string;
  readonly baselineMedianMs: number;
  readonly improvedMedianMs: number;
  readonly medianReductionPercent: number;
  readonly baselineP95Ms: number;
  readonly improvedP95Ms: number;
  readonly baselineStatements: number;
  readonly improvedStatements: number;
  readonly baselineSequentialScans: string;
  readonly improvedSequentialScans: string;
}

export function databaseComparison(records: readonly LoadedRecord[]) {
  const runs = pair(records, "Benchmark C");
  if (runs === null) {
    return null;
  }
  const steps = (r: LoadedRecord) => r.results as DbStep[];
  const seq = (op: DbOperation) =>
    [...new Set(op.plans.flatMap((p) => p.sequentialScans.map((s) => s.relation)))].join(", ") || "none";
  const scales = steps(runs.baseline).map((b) => {
    const i = steps(runs.improved).find((s) => s.measuredUserAudits === b.measuredUserAudits);
    const rows: DbComparisonRow[] = b.operations.flatMap((bo) => {
      const io = i?.operations.find((o) => o.operation === bo.operation);
      return io === undefined
        ? []
        : [
            {
              operation: bo.operation,
              baselineMedianMs: round(bo.latencyMs.median, 2),
              improvedMedianMs: round(io.latencyMs.median, 2),
              medianReductionPercent: round(improvementPercent(bo.latencyMs.median, io.latencyMs.median), 1),
              baselineP95Ms: round(bo.latencyMs.p95, 2),
              improvedP95Ms: round(io.latencyMs.p95, 2),
              baselineStatements: bo.queryCount,
              improvedStatements: io.queryCount,
              baselineSequentialScans: seq(bo),
              improvedSequentialScans: seq(io),
            },
          ];
    });
    return { measuredUserAudits: b.measuredUserAudits, totalAudits: b.rows.audits, rows };
  });
  return { ...runs, scales };
}

// ---------------------------------------------------------------------------------------------
// E: reliability
// ---------------------------------------------------------------------------------------------

interface FaultResult {
  readonly logicalSubmissions: number;
  readonly completed: number;
  readonly failed: number;
  readonly longestStretchWithoutCompletionsSeconds: number;
  readonly completionsResumedSecondsAfterFaultEnd: number;
  readonly attemptStatusCounts: Readonly<Record<string, number>>;
  readonly integrity: {
    readonly duplicateKeys: number;
    readonly acknowledgedButMissing: number;
    readonly orphanFindings: number;
    readonly findingsMismatches: number;
    readonly notCompleted: number;
  };
}

export interface ReliabilityResults {
  readonly duplicates: {
    readonly sequential: { requests: number; auditsStored: number };
    readonly concurrent: { requests: number; auditsStored: number };
    readonly keyReuseWithDifferentBody: { status: number };
  };
  readonly apiCrash: FaultResult;
  readonly databaseOutage: FaultResult;
}

export function reliabilityRuns(records: readonly LoadedRecord[]) {
  const runs = records
    .filter((r) => r.benchmark.startsWith("Benchmark E") && r.status === "COMPLETED")
    .sort((a, b) => a.environment.timestampUtc.localeCompare(b.environment.timestampUtc));
  const latestRun = runs.at(-1);
  if (latestRun === undefined) {
    return null;
  }
  const results = latestRun.results as ReliabilityResults;
  const faults = [results.apiCrash, results.databaseOutage];
  const submissions = faults.reduce((s, f) => s + f.logicalSubmissions, 0);
  const completed = faults.reduce((s, f) => s + f.completed, 0);
  const integrityFailures = faults.reduce(
    (s, f) =>
      s +
      f.integrity.duplicateKeys +
      f.integrity.acknowledgedButMissing +
      f.integrity.orphanFindings +
      f.integrity.findingsMismatches +
      f.integrity.notCompleted,
    0,
  );
  const baseline = runs.filter((r) => labelOf(r) === "baseline").at(-1) ?? null;
  return { latest: latestRun, baseline, results, submissions, completed, integrityFailures };
}
