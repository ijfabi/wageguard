/**
 * Builds benchmarks/reports/summary.md from the latest record of each benchmark. Reads raw results
 * only; never computes or invents a value that is not in a saved record.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { compareEngineRuns } from "../lib/comparison.js";
import { engineLabel, latest, loadRecords, type EngineSizeResult, type LoadedRecord } from "../lib/load.js";
import { REPORTS_DIR } from "../lib/results.js";
import { round } from "../lib/stats.js";

const records = loadRecords();
const isLatestEngineRun = (r: LoadedRecord): boolean =>
  r.benchmark === "A-engine-throughput" && engineLabel(r) !== "baseline";
const BENCHMARKS: readonly { id: string; title: string; match: (r: LoadedRecord) => boolean }[] = [
  { id: "A", title: "Calculation engine throughput", match: isLatestEngineRun },
  {
    id: "B",
    title: "Audit API performance",
    match: (r) => r.benchmark.startsWith("Benchmark B") || r.benchmark === "B-api",
  },
  {
    id: "C",
    title: "Database query performance",
    match: (r) => r.benchmark.startsWith("Benchmark C") || r.benchmark === "C-database",
  },
  { id: "D", title: "Correctness evaluation", match: (r) => r.benchmark === "D-correctness" },
  {
    id: "E",
    title: "Reliability and recovery",
    match: (r) => r.benchmark.startsWith("Benchmark E") || r.benchmark === "E-reliability",
  },
];

const statusRows = BENCHMARKS.map(({ id, title, match }) => {
  const record = latest(records, match);
  return record === null
    ? `| ${id} | ${title} | NOT_EXECUTED | No run recorded | - |`
    : `| ${id} | ${title} | ${record.status} | ${record.reason ?? record.environment.timestampUtc} | \`${record.file}\` |`;
}).join("\n");

const engine = latest(records, isLatestEngineRun);
const engineTable =
  engine === null
    ? "No engine run recorded."
    : [
        "| Shifts | Shifts/s (median) | Total ms (median) | Total ms (p95 of repetitions) | Per pay period ms (p95) | Peak RSS MiB |",
        "| --- | --- | --- | --- | --- | --- |",
        ...(engine.results as EngineSizeResult[]).map(
          (s) =>
            `| ${s.shifts} | ${round(s.shiftsPerSecond.median, 0)} | ${round(s.repetitionTotalMs.median, 2)} | ${round(s.repetitionTotalMs.p95, 2)} | ${round(s.perPayPeriodMs.p95, 3)} | ${round(s.peakRssBytes / 1024 ** 2, 1)} |`,
        ),
      ].join("\n");

const comparison = compareEngineRuns(records);
const comparisonSection =
  comparison === null
    ? "No baseline/optimised pair recorded."
    : `Baseline: \`${comparison.baseline.file}\` (source tree \`${comparison.baseline.environment.sourceTreeSha256.slice(0, 12)}\`)
Optimised: \`${comparison.improved.file}\` (source tree \`${comparison.improved.environment.sourceTreeSha256.slice(0, 12)}\`, label \`${engineLabel(comparison.improved)}\`)

Comparable environment and workload: **${comparison.comparable ? "yes" : `no: ${comparison.problems.join("; ")}`}**

| Shifts | Median total ms (baseline -> optimised) | Improvement | Median shifts/s (baseline -> optimised) | Throughput increase | p95 per-period ms (baseline -> optimised) | Improvement |
| --- | --- | --- | --- | --- | --- | --- |
${comparison.sizes
  .map(
    (s) =>
      `| ${s.shifts} | ${s.baselineMedianTotalMs} -> ${s.improvedMedianTotalMs} | ${s.medianTotalTimeImprovementPercent}% | ${s.baselineMedianShiftsPerSecond} -> ${s.improvedMedianShiftsPerSecond} | +${s.medianThroughputIncreasePercent}% | ${s.baselineP95PerPeriodMs} -> ${s.improvedP95PerPeriodMs} | ${s.p95PerPeriodLatencyImprovementPercent}% |`,
  )
  .join("\n")}

Output equivalence: ${
        comparison.equivalence === null
          ? "NOT_VERIFIED"
          : `${(comparison.equivalence.results as { identical: boolean }).identical ? "identical" : "DIFFERENT"} result digests with and without the optimisation (\`${comparison.equivalence.file}\`)`
      }.

Formulas: improvement % = (baseline - improved) / baseline x 100 (time, latency); throughput increase % = (improved - baseline) / baseline x 100.`;

const summary = `# Benchmark summary

Generated from ${records.length} raw result file(s) in \`benchmarks/results/\`. Every number below is copied from a saved record.

## Status

| ID | Benchmark | Status | Latest run / reason | Evidence |
| --- | --- | --- | --- | --- |
${statusRows}

## A: Calculation engine throughput (latest optimised run)

${engineTable}

## F: Baseline comparison (offset-table optimisation)

${comparisonSection}

## Limits

All measurements are synthetic, from a single developer workstation, and describe the isolated calculation engine unless stated otherwise. They are not production observations and do not predict deployed capacity.
`;

writeFileSync(path.join(REPORTS_DIR, "summary.md"), summary);
console.log(summary);
