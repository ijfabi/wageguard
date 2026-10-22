/**
 * Benchmark A: isolated calculation-engine throughput (no HTTP, no database).
 *
 * For each workload size, the deterministic workload is generated once, run for warm-up
 * repetitions, then measured for N repetitions. Each repetition calculates every pay period
 * sequentially in one process. A forced GC precedes each repetition (requires --expose-gc).
 */
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { bundledRegistry } from "@wageguard/award-rules";
import { ENGINE_VERSION, calculatePayPeriod } from "@wageguard/calculation-engine";
import { Instant } from "@wageguard/domain";
import { WORKLOAD_GENERATOR_VERSION, countShifts, generateWorkload } from "@wageguard/test-fixtures";

import { captureEnvironment } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";
import { distribution, round, type Distribution } from "../lib/stats.js";

const SEED = 20_260_706;
const SIZES = [100, 1_000, 10_000] as const;
const WARMUP_REPETITIONS = 3;
const MEASURED_REPETITIONS = 10;
const label = process.env["BENCHMARK_LABEL"] ?? "unlabelled";

interface SizeResult {
  readonly shifts: number;
  readonly payPeriods: number;
  readonly repetitionTotalMs: Distribution;
  readonly shiftsPerSecond: Distribution;
  readonly perPayPeriodMs: Distribution;
  readonly cpuUtilisationPercent: Distribution;
  readonly heapUsedDeltaBytes: Distribution;
  readonly peakRssBytes: number;
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly errors: number;
  /** SHA-256 over every result (first measured repetition): proves optimisations preserve output. */
  readonly outputSha256: string;
  readonly rawRepetitionTotalMs: readonly number[];
}

const exposedGc = (globalThis as { gc?: () => void }).gc;
if (exposedGc === undefined) {
  throw new Error("Run with --expose-gc so each repetition starts from a collected heap.");
}
const gc: () => void = exposedGc;
const context = { rules: bundledRegistry(), calculatedAt: Instant.parse("2026-10-22T00:00:00Z") };

function runSize(size: number): SizeResult {
  const workload = generateWorkload(SEED, size);
  const statusCounts: Record<string, number> = {};
  const outputHash = createHash("sha256");
  let errors = 0;
  const runOnce = (record: boolean, perPeriod: number[]): void => {
    for (const period of workload) {
      const started = performance.now();
      try {
        const result = calculatePayPeriod(period, context);
        if (record) {
          statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
          outputHash.update(JSON.stringify(result));
        }
      } catch {
        errors += 1;
      }
      if (record) {
        perPeriod.push(performance.now() - started);
      }
    }
  };

  for (let i = 0; i < WARMUP_REPETITIONS; i += 1) {
    runOnce(false, []);
  }

  const totals: number[] = [];
  const throughput: number[] = [];
  const perPeriod: number[] = [];
  const cpu: number[] = [];
  const heapDeltas: number[] = [];
  for (let i = 0; i < MEASURED_REPETITIONS; i += 1) {
    gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    // Per-period latencies and statuses are recorded on the first measured repetition only.
    runOnce(i === 0, i === 0 ? perPeriod : []);
    const elapsedMs = performance.now() - started;
    const cpuUsed = process.cpuUsage(cpuBefore);
    totals.push(elapsedMs);
    throughput.push(countShifts(workload) / (elapsedMs / 1000));
    cpu.push(((cpuUsed.user + cpuUsed.system) / 1000 / elapsedMs) * 100);
    heapDeltas.push(process.memoryUsage().heapUsed - heapBefore);
  }

  return {
    shifts: countShifts(workload),
    payPeriods: workload.length,
    repetitionTotalMs: distribution(totals),
    shiftsPerSecond: distribution(throughput),
    perPayPeriodMs: distribution(perPeriod),
    cpuUtilisationPercent: distribution(cpu),
    heapUsedDeltaBytes: distribution(heapDeltas),
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    statusCounts,
    errors,
    outputSha256: outputHash.digest("hex"),
    rawRepetitionTotalMs: totals.map((t) => round(t, 4)),
  };
}

const environment = captureEnvironment("engine");
const results = SIZES.map((size) => {
  console.log(`Benchmark A: ${size} shifts...`);
  return runSize(size);
});
const errorCount = results.reduce((sum, r) => sum + r.errors, 0);

const configuration = {
  label,
  engineVersion: ENGINE_VERSION,
  workloadGeneratorVersion: WORKLOAD_GENERATOR_VERSION,
  seed: SEED,
  sizes: SIZES,
  warmupRepetitions: WARMUP_REPETITIONS,
  measuredRepetitions: MEASURED_REPETITIONS,
  ruleSet: "MA000004/2026-07-01/r1",
  scope:
    "Isolated calculation engine in a single Node.js process. Excludes HTTP, JSON parsing of requests, and database access.",
};

const table = results
  .map(
    (r) =>
      `| ${r.shifts.toLocaleString("en-AU")} | ${r.payPeriods} | ${round(r.shiftsPerSecond.median, 0).toLocaleString("en-AU")} | ` +
      `${round(r.repetitionTotalMs.mean, 2)} | ${round(r.repetitionTotalMs.median, 2)} | ${round(r.repetitionTotalMs.p95, 2)} | ` +
      `${round(r.repetitionTotalMs.stddev, 2)} | ${round(r.perPayPeriodMs.median, 4)} | ${round(r.perPayPeriodMs.p95, 4)} | ` +
      `${round(r.cpuUtilisationPercent.median, 1)} | ${round(r.peakRssBytes / 1024 ** 2, 1)} | ${r.errors} |`,
  )
  .join("\n");

const markdown = `# Benchmark A: calculation engine throughput (${label})

${environmentMarkdown(environment)}

**Configuration:** seed ${SEED}, workload generator v${WORKLOAD_GENERATOR_VERSION}, ${WARMUP_REPETITIONS} warm-up and ${MEASURED_REPETITIONS} measured repetitions per size, engine ${ENGINE_VERSION}.

${configuration.scope}

| Shifts | Pay periods | Shifts/s (median) | Total ms (mean) | Total ms (median) | Total ms (p95) | Total ms (stddev) | Per period ms (median) | Per period ms (p95) | CPU % (median) | Peak RSS MiB | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${table}

Status mix per size (first measured repetition): ${results.map((r) => `${r.shifts}: ${JSON.stringify(r.statusCounts)}`).join("; ")}.

Output digests (SHA-256 of every result): ${results.map((r) => `${r.shifts}: \`${r.outputSha256.slice(0, 16)}\``).join("; ")}.

These are synthetic, single-process measurements on the machine described above. They are not end-to-end API throughput and do not predict production capacity.
`;

const saved = saveRecord(
  {
    benchmark: "A-engine-throughput",
    status: "COMPLETED",
    reason: null,
    environment,
    configuration,
    results,
    errorCount,
    exitStatus: errorCount === 0 ? 0 : 1,
  },
  markdown,
);
console.log(markdown);
console.log(`Saved ${saved.json}`);
process.exitCode = errorCount === 0 ? 0 : 1;
