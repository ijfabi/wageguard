import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT, type Environment } from "./environment.js";

export type ExecutionStatus = "COMPLETED" | "FAILED" | "NOT_EXECUTED";

export interface BenchmarkRecord<TResults = unknown> {
  readonly benchmark: string;
  readonly status: ExecutionStatus;
  readonly reason: string | null;
  readonly environment: Environment;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly results: TResults;
  readonly errorCount: number;
  readonly exitStatus: number;
}

export const RESULTS_DIR = path.join(REPO_ROOT, "benchmarks", "results");
export const REPORTS_DIR = path.join(REPO_ROOT, "benchmarks", "reports");

/** Writes the machine-readable record and a human-readable report. Raw results are never overwritten. */
export function saveRecord(record: BenchmarkRecord, markdown: string): { json: string; md: string } {
  mkdirSync(RESULTS_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });
  const json = path.join(RESULTS_DIR, `${record.environment.runId}.json`);
  const md = path.join(REPORTS_DIR, `${record.environment.runId}.md`);
  writeFileSync(json, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  writeFileSync(md, markdown, { flag: "wx" });
  return { json, md };
}

export function environmentMarkdown(env: Environment): string {
  return [
    "| Field | Value |",
    "| --- | --- |",
    `| Run ID | \`${env.runId}\` |`,
    `| Timestamp (UTC) | ${env.timestampUtc} |`,
    `| Git commit | ${env.git.commitSha ?? `not available (${env.git.note ?? ""})`} |`,
    `| Source tree SHA-256 | \`${env.sourceTreeSha256}\` |`,
    `| Environment | ${env.environment} |`,
    `| OS | ${env.os.platform} ${env.os.release} (${env.os.arch}) |`,
    `| CPU | ${env.cpu.model}, ${env.cpu.logicalCores} logical cores |`,
    `| Memory | ${(env.memory.totalBytes / 1024 ** 3).toFixed(1)} GiB total |`,
    `| Node.js | ${env.node} |`,
    `| Docker | ${env.dockerVersion ?? "not available"} |`,
    `| PostgreSQL | ${env.postgresVersion ?? "not used"} |`,
    ...(env.cpuBusyPercentAtStart === undefined
      ? []
      : [`| CPU busy before the run | ${env.cpuBusyPercentAtStart}% of all cores (1 s sample) |`]),
  ].join("\n");
}
