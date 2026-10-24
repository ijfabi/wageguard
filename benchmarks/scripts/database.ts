/**
 * Benchmark C: database query performance.
 *
 *   pnpm build && BENCHMARK_LABEL=baseline pnpm benchmark:database
 *
 * Runs apps/api/scripts/bench-database.ts in a plain Node process (see that file for the method),
 * then turns its raw measurements into a saved record and report.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RawOutput } from "../lib/database-raw.js";
import { REPO_ROOT, captureEnvironment, sampleCpuBusyPercent } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";
import { distribution, round } from "../lib/stats.js";

const LABEL = process.env["BENCHMARK_LABEL"] ?? "unlabelled";
const API_ROOT = path.join(REPO_ROOT, "apps", "api");

const cpuBusyPercentAtStart = await sampleCpuBusyPercent();
const scratch = mkdtempSync(path.join(os.tmpdir(), "wageguard-bench-db-"));
const outputFile = path.join(scratch, "raw.json");
execFileSync(process.execPath, ["scripts/bench-database.ts", outputFile], {
  cwd: API_ROOT,
  stdio: "inherit",
});
const raw = JSON.parse(readFileSync(outputFile, "utf8")) as RawOutput;
rmSync(scratch, { recursive: true, force: true });

const results = raw.steps.map((step) => ({
  ...step,
  seedSeconds: round(step.seedSeconds, 1),
  operations: step.operations.map(({ latenciesMs, ...op }) => ({
    ...op,
    latencyMs: distribution(latenciesMs),
    rawLatenciesMs: latenciesMs.map((v) => round(v, 3)),
  })),
}));

const environment = captureEnvironment("database", {
  postgresVersion: raw.postgresVersion,
  cpuBusyPercentAtStart,
});
const method =
  "Compiled services called in-process (no HTTP) against PostgreSQL in a container; latency is wall time per service call including Prisma. SQL statements are counted at the pg driver during the first measured call (BEGIN/COMMIT included). EXPLAIN (ANALYZE, BUFFERS) re-runs each distinct SELECT with its captured parameters on a warm cache.";
const configuration = { label: LABEL, method, ...raw.configuration };

const fmt = (n: number) => n.toLocaleString("en-AU");
const sections = results
  .map((step) => {
    const rows = step.operations
      .map((op) => {
        const seq = [...new Set(op.plans.flatMap((p) => p.sequentialScans.map((s) => s.relation)))];
        const exec = op.plans.reduce((s, p) => s + p.executionMs, 0);
        return `| ${op.operation} | ${round(op.latencyMs.median, 2)} | ${round(op.latencyMs.p95, 2)} | ${op.queryCount} | ${op.plans.length === 0 ? "not run (writes)" : round(exec, 3)} | ${seq.length === 0 ? "none" : seq.join(", ")} |`;
      })
      .join("\n");
    return `### ${fmt(step.measuredUserAudits)} audits for the measured user

${fmt(step.rows.audits)} audits, ${fmt(step.rows.findings)} findings, ${fmt(step.rows.shifts)} shifts and ${fmt(step.rows.payslips)} payslips in total; database ${round(step.rows.bytes / 1024 ** 2, 1)} MiB; seeding took ${step.seedSeconds} s.

| Operation | Median (ms) | p95 (ms) | SQL statements | EXPLAIN execution, all reads (ms) | Sequential scans |
| --- | --- | --- | --- | --- | --- |
${rows}`;
  })
  .join("\n\n");

const markdown = `# Benchmark C: database query performance (${LABEL})

${method}

${sections}

Every statement's plan (node types, indexes used, buffers) is in the JSON record.

${environmentMarkdown(environment)}
`;
const saved = saveRecord(
  {
    benchmark: "Benchmark C: database query performance",
    status: "COMPLETED",
    reason: null,
    environment,
    configuration,
    results,
    errorCount: 0,
    exitStatus: 0,
  },
  markdown,
);
console.log(markdown);
console.log(`Saved ${saved.json}`);
