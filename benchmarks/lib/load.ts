import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Distribution } from "./stats.js";
import { RESULTS_DIR, type BenchmarkRecord } from "./results.js";

export interface LoadedRecord extends BenchmarkRecord {
  readonly file: string;
}

export interface EngineSizeResult {
  readonly shifts: number;
  readonly payPeriods: number;
  readonly repetitionTotalMs: Distribution;
  readonly shiftsPerSecond: Distribution;
  readonly perPayPeriodMs: Distribution;
  readonly peakRssBytes: number;
  readonly errors: number;
  readonly outputSha256?: string;
}

export function loadRecords(): LoadedRecord[] {
  if (!existsSync(RESULTS_DIR)) {
    return [];
  }
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      ...(JSON.parse(readFileSync(path.join(RESULTS_DIR, f), "utf8")) as BenchmarkRecord),
      file: `benchmarks/results/${f}`,
    }))
    .sort((a, b) => (a.environment.timestampUtc < b.environment.timestampUtc ? -1 : 1));
}

export function latest(
  records: readonly LoadedRecord[],
  predicate: (r: LoadedRecord) => boolean,
): LoadedRecord | null {
  return [...records].reverse().find(predicate) ?? null;
}

export const engineLabel = (r: LoadedRecord): string => {
  const label = r.configuration["label"];
  return typeof label === "string" ? label : "";
};

/** Two runs are comparable only on the same machine, runtime and workload definition. */
export function comparable(a: LoadedRecord, b: LoadedRecord): string[] {
  const problems: string[] = [];
  const same = (name: string, x: unknown, y: unknown): void => {
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      problems.push(`${name} differs (${JSON.stringify(x)} vs ${JSON.stringify(y)})`);
    }
  };
  same("CPU", a.environment.cpu, b.environment.cpu);
  same("OS", a.environment.os, b.environment.os);
  same("Node.js", a.environment.node, b.environment.node);
  for (const key of [
    "seed",
    "sizes",
    "workloadGeneratorVersion",
    "warmupRepetitions",
    "measuredRepetitions",
  ]) {
    same(key, a.configuration[key], b.configuration[key]);
  }
  return problems;
}
