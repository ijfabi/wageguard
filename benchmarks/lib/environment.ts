import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Source directories whose content identifies the code under test (engine, API and schema). */
const SOURCE_DIRS = [
  "packages/domain/src",
  "packages/award-rules/src",
  "packages/calculation-engine/src",
  "packages/test-fixtures/src",
  "packages/api-contracts/src",
  "packages/presentation/src",
  "apps/api/src",
  "apps/api/prisma",
];

export interface Environment {
  readonly runId: string;
  readonly timestampUtc: string;
  readonly git: {
    readonly commitSha: string | null;
    readonly dirty: boolean | null;
    readonly note: string | null;
  };
  /** SHA-256 over every source file: identifies the exact code even when git is unavailable. */
  readonly sourceTreeSha256: string;
  readonly environment: string;
  readonly os: { readonly platform: string; readonly release: string; readonly arch: string };
  readonly cpu: { readonly model: string; readonly logicalCores: number };
  readonly memory: { readonly totalBytes: number; readonly freeBytesAtStart: number };
  readonly node: string;
  readonly dockerVersion: string | null;
  readonly postgresVersion: string | null;
  /**
   * Share of all CPU time that was busy during a 1 s sample just before the run (0-100). Recorded
   * because this is a shared developer machine: a high value means the run competed for CPU.
   */
  readonly cpuBusyPercentAtStart?: number;
}

export function captureEnvironment(
  kind: string,
  extras: { postgresVersion?: string | null; cpuBusyPercentAtStart?: number } = {},
): Environment {
  const timestamp = new Date();
  const git = gitInfo();
  return {
    runId: `${kind}-${timestamp.toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`,
    timestampUtc: timestamp.toISOString(),
    git,
    sourceTreeSha256: sourceTreeHash(),
    environment: process.env["BENCHMARK_ENVIRONMENT"] ?? "local-developer-workstation",
    os: { platform: os.platform(), release: os.release(), arch: os.arch() },
    cpu: { model: os.cpus()[0]?.model.trim() ?? "unknown", logicalCores: os.cpus().length },
    memory: { totalBytes: os.totalmem(), freeBytesAtStart: os.freemem() },
    node: process.version,
    dockerVersion: tryExec("docker", ["--version"]),
    postgresVersion: extras.postgresVersion ?? null,
    ...(extras.cpuBusyPercentAtStart === undefined
      ? {}
      : { cpuBusyPercentAtStart: extras.cpuBusyPercentAtStart }),
  };
}

/** Busy share of all logical cores over `ms` milliseconds (portable; load average is 0 on Windows). */
export async function sampleCpuBusyPercent(ms = 1_000): Promise<number> {
  const totals = () =>
    os.cpus().reduce(
      (acc, cpu) => {
        const { idle, ...rest } = cpu.times;
        const busy = Object.values(rest).reduce((s, v) => s + v, 0);
        return { busy: acc.busy + busy, all: acc.all + busy + idle };
      },
      { busy: 0, all: 0 },
    );
  const before = totals();
  await new Promise((resolve) => setTimeout(resolve, ms));
  const after = totals();
  const all = after.all - before.all;
  return all === 0 ? 0 : Math.round(((after.busy - before.busy) / all) * 1000) / 10;
}

function gitInfo(): Environment["git"] {
  const sha = tryExec("git", ["rev-parse", "HEAD"]);
  if (sha === null) {
    return {
      commitSha: null,
      dirty: null,
      note: "git unavailable or not a repository; see sourceTreeSha256",
    };
  }
  const status = tryExec("git", ["status", "--porcelain"]);
  return { commitSha: sha, dirty: status === null ? null : status.length > 0, note: null };
}

function tryExec(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function sourceTreeHash(): string {
  const hash = createHash("sha256");
  for (const dir of SOURCE_DIRS) {
    for (const file of listFiles(path.join(REPO_ROOT, dir))) {
      hash.update(path.relative(REPO_ROOT, file).replaceAll("\\", "/"));
      // Normalise line endings so the hash is stable across checkouts.
      hash.update(readFileSync(file, "utf8").replaceAll("\r\n", "\n"));
    }
  }
  return hash.digest("hex");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? listFiles(full) : [full];
    });
}
