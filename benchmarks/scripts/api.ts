/**
 * Benchmark B: audit API performance (k6).
 *
 *   BENCHMARK_LABEL=baseline pnpm benchmark:api
 *
 * 1. Builds and starts the isolated stack in benchmarks/k6/docker-compose.yml (PostgreSQL,
 *    migrations and the production API image) under its own project name.
 * 2. Runs benchmarks/k6/audit-api.js in the k6 container on the same network, writing every data
 *    point inside the k6 container, then copies the file to benchmarks/k6/out/raw.ndjson.
 * 3. Computes per-level statistics from those raw points (nearest-rank percentiles, as in the other
 *    benchmarks), and checks data integrity in the database afterwards.
 * 4. Removes the stack and its data.
 *
 * Load generator, API and database share one machine, so the numbers are a capacity profile of
 * this workstation, not of a production deployment.
 */
import { execFileSync } from "node:child_process";
import { createReadStream, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { REPO_ROOT, captureEnvironment, sampleCpuBusyPercent } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";
import { distribution, round, type Distribution } from "../lib/stats.js";

const LABEL = process.env["BENCHMARK_LABEL"] ?? "unlabelled";
const LEVELS = (process.env["BENCHMARK_API_LEVELS"] ?? "1,10,25,50").split(",").map(Number);
const WARMUP_SECONDS = Number(process.env["BENCHMARK_API_WARMUP_SECONDS"] ?? 10);
const MEASURE_SECONDS = Number(process.env["BENCHMARK_API_MEASURE_SECONDS"] ?? 60);
const K6_DIR = path.join(REPO_ROOT, "benchmarks", "k6");
const OUT_DIR = path.join(K6_DIR, "out");
const RAW = path.join(OUT_DIR, "raw.ndjson");
const COMPOSE = ["compose", "-f", path.join(K6_DIR, "docker-compose.yml")];
const K6_CONTAINER = "wageguard-bench-k6-run";
const ENDPOINTS = ["dashboard", "audit_list", "audit_detail", "audit_lines", "audit_create"] as const;

const docker = (args: string[], options: { inherit?: boolean; timeoutMs?: number } = {}): string =>
  execFileSync("docker", [...COMPOSE, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    // stdin is never passed on: `compose run` attaches it by default, and an inherited stdin left
    // k6 hanging part-way through multi-level runs launched from this script.
    stdio: options.inherit === true ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs, killSignal: "SIGKILL" }),
  });

/** The planned k6 run time plus 5 minutes for setup; a run that exceeds it is treated as hung. */
const K6_TIMEOUT_MS = (LEVELS.length * (WARMUP_SECONDS + MEASURE_SECONDS + 10) + 300) * 1000;

const cpuBusyPercentAtStart = await sampleCpuBusyPercent();
console.log(`CPU busy before start: ${cpuBusyPercentAtStart}%`);
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let exitStatus = 0;
let integrity: { auditsStored: number; distinctKeys: number; orphanFindings: number };
let apiImage: string;
try {
  console.log("Starting the isolated benchmark stack...");
  docker(["down", "-v", "--remove-orphans"]);
  docker(["up", "-d", "--build", "--wait", "api"], { inherit: true });
  apiImage = execFileSync("docker", ["inspect", "wageguard-bench-api-1", "--format", "{{.Image}}"], {
    encoding: "utf8",
  }).trim();

  console.log("Running k6...");
  try {
    docker(
      [
        "run",
        "-T",
        "--name",
        K6_CONTAINER,
        "-e",
        `LEVELS=${LEVELS.join(",")}`,
        "-e",
        `WARMUP_SECONDS=${WARMUP_SECONDS}`,
        "-e",
        `MEASURE_SECONDS=${MEASURE_SECONDS}`,
        "k6",
        "run",
        "--quiet",
        "--summary-mode=disabled",
        "--out",
        "json=/tmp/raw.ndjson",
        "/scripts/audit-api.js",
      ],
      { inherit: true, timeoutMs: K6_TIMEOUT_MS },
    );
  } catch {
    exitStatus = 1; // analysed below; failed requests are part of the result
  }

  // Copy the raw points out of the stopped k6 container through the Docker API.
  execFileSync("docker", ["cp", `${K6_CONTAINER}:/tmp/raw.ndjson`, RAW]);

  const psql = (sql: string) =>
    docker(["exec", "-T", "postgres", "psql", "-U", "wageguard", "-d", "wageguard", "-tAc", sql]).trim();
  const [stored, distinct] = psql(
    "SELECT count(*), count(DISTINCT (user_id, idempotency_key)) FROM audits",
  ).split("|");
  integrity = {
    auditsStored: Number(stored),
    distinctKeys: Number(distinct),
    orphanFindings: Number(
      psql(
        "SELECT count(*) FROM audit_findings f LEFT JOIN audits a ON a.id = f.audit_id WHERE a.id IS NULL",
      ),
    ),
  };
} finally {
  // `compose down` does not remove containers started with `compose run` (a timed-out k6).
  const leftovers = execFileSync("docker", ["ps", "-aq", "--filter", "name=wageguard-bench-k6-run"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((id) => id !== "");
  if (leftovers.length > 0) {
    execFileSync("docker", ["rm", "-f", ...leftovers]);
  }
  docker(["down", "-v", "--remove-orphans"]);
}

// ---------------------------------------------------------------------------------------------
// Analysis of the raw data points
// ---------------------------------------------------------------------------------------------

interface Point {
  type: string;
  metric: string;
  data: { time: string; value: number; tags?: Record<string, string> };
}

interface LevelAccumulator {
  durations: Map<string, number[]>;
  failed: number;
  requests: number;
  checksPassed: number;
  checksTotal: number;
  firstMs: number;
  lastMs: number;
}

const levels = new Map<string, LevelAccumulator>();
let successfulCreates = 0;
const lines = createInterface({ input: createReadStream(RAW), crlfDelay: Infinity });
for await (const line of lines) {
  // Data points look like {"metric":...,"type":"Point",...}; metric definitions are skipped.
  if (!line.includes('"type":"Point"')) {
    continue;
  }
  const point = JSON.parse(line) as Point;
  const tags = point.data.tags ?? {};
  const scenario = tags["scenario"] ?? "";
  if (point.metric === "checks" && tags["check"] === "ok audit_create" && point.data.value === 1) {
    successfulCreates += 1; // every phase, for the integrity comparison
  }
  if (!scenario.startsWith("run_")) {
    continue; // warm-up and setup are not measured
  }
  let acc = levels.get(scenario);
  if (acc === undefined) {
    acc = {
      durations: new Map(),
      failed: 0,
      requests: 0,
      checksPassed: 0,
      checksTotal: 0,
      firstMs: Infinity,
      lastMs: -Infinity,
    };
    levels.set(scenario, acc);
  }
  if (point.metric === "http_req_duration") {
    const name = tags["name"] ?? "other";
    const list = acc.durations.get(name) ?? [];
    list.push(point.data.value);
    acc.durations.set(name, list);
    acc.requests += 1;
    const t = Date.parse(point.data.time);
    acc.firstMs = Math.min(acc.firstMs, t);
    acc.lastMs = Math.max(acc.lastMs, t);
  } else if (point.metric === "http_req_failed") {
    acc.failed += point.data.value;
  } else if (point.metric === "checks") {
    acc.checksTotal += 1;
    acc.checksPassed += point.data.value;
  }
}

interface LevelResult {
  readonly concurrentClients: number;
  readonly requests: number;
  readonly measuredSeconds: number;
  readonly throughputRps: number;
  readonly errorRatePercent: number;
  readonly successfulCompletionPercent: number;
  readonly latencyMs: Distribution;
  readonly byEndpoint: Readonly<Record<string, Distribution & { share: number }>>;
}

const results: LevelResult[] = LEVELS.map((level) => {
  const acc = levels.get(`run_${level}`);
  if (acc === undefined || acc.requests === 0) {
    throw new Error(`No measured data for ${level} clients`);
  }
  const all = [...acc.durations.values()].flat();
  // Requests are timestamped at completion; the span is first-to-last completion in the phase.
  const measuredSeconds = (acc.lastMs - acc.firstMs) / 1000;
  const byEndpoint: Record<string, Distribution & { share: number }> = {};
  for (const name of ENDPOINTS) {
    const values = acc.durations.get(name) ?? [];
    byEndpoint[name] = { ...distribution(values), share: round((values.length / acc.requests) * 100, 1) };
  }
  return {
    concurrentClients: level,
    requests: acc.requests,
    measuredSeconds: round(measuredSeconds, 1),
    throughputRps: round(acc.requests / measuredSeconds, 1),
    errorRatePercent: round((acc.failed / acc.requests) * 100, 3),
    successfulCompletionPercent: round((acc.checksPassed / acc.checksTotal) * 100, 3),
    latencyMs: distribution(all),
    byEndpoint,
  };
});
const rawBytes = statSync(RAW).size;
rmSync(OUT_DIR, { recursive: true, force: true });

const setupAudits = Math.max(...LEVELS);
const integrityResult = {
  ...integrity,
  successfulCreateResponses: successfulCreates,
  expectedAudits: successfulCreates + setupAudits,
  duplicateAudits: integrity.auditsStored - integrity.distinctKeys,
  missingOrExtraAudits: integrity.auditsStored - (successfulCreates + setupAudits),
};

// ---------------------------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------------------------

const environment = captureEnvironment("api", { postgresVersion: "17.6", cpuBusyPercentAtStart });
const configuration = {
  label: LABEL,
  tool: "k6 2.3.0 (grafana/k6 image)",
  model:
    "Closed: constant virtual users, no think time; each level runs a discarded warm-up then a measured phase.",
  levels: LEVELS,
  warmupSeconds: WARMUP_SECONDS,
  measuredSeconds: MEASURE_SECONDS,
  requestMix:
    "Fixed 20-slot cycle per virtual user: dashboard 30%, audit history 25%, audit detail 20%, audit lines 10%, audit creation 15%",
  accounts: `${setupAudits} synthetic users seeded in k6 setup (one per virtual user), each with 6 shifts, a payslip and one audit`,
  target:
    "Production API image (NODE_ENV=production, Secure cookies) and PostgreSQL 17.6 in an isolated compose project; rate limits raised",
  apiImageId: apiImage,
  queueMetrics: "Not applicable: audits are processed synchronously within the request (ADR 0010)",
  rawDataPointsBytes: rawBytes,
};

const rows = results
  .map(
    (r) =>
      `| ${r.concurrentClients} | ${r.requests.toLocaleString("en-AU")} | ${r.throughputRps} | ${round(r.latencyMs.median, 1)} | ${round(r.latencyMs.p95, 1)} | ${round(r.latencyMs.p99, 1)} | ${r.errorRatePercent}% | ${r.successfulCompletionPercent}% |`,
  )
  .join("\n");
const endpointRows = results
  .map((r) =>
    ENDPOINTS.map((name) => {
      const d = r.byEndpoint[name] as Distribution & { share: number };
      return `| ${r.concurrentClients} | ${name} | ${d.share}% | ${round(d.median, 1)} | ${round(d.p95, 1)} | ${round(d.p99, 1)} |`;
    }).join("\n"),
  )
  .join("\n");

const markdown = `# Benchmark B: audit API performance (${LABEL})

${configuration.model} ${configuration.requestMix}. ${configuration.target}. Load generator, API and database run on the same workstation.

| Concurrent clients | Requests | Throughput (req/s) | p50 (ms) | p95 (ms) | p99 (ms) | Error rate | Successful completion |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Latency by request type

| Clients | Request | Share | p50 (ms) | p95 (ms) | p99 (ms) |
| --- | --- | --- | --- | --- | --- |
${endpointRows}

## Data integrity after the run

${integrityResult.auditsStored.toLocaleString("en-AU")} audits stored; ${integrityResult.expectedAudits.toLocaleString("en-AU")} expected (${integrityResult.successfulCreateResponses.toLocaleString("en-AU")} successful creation responses + ${setupAudits} from setup). Duplicates: ${integrityResult.duplicateAudits}. Difference from expected: ${integrityResult.missingOrExtraAudits}. Orphaned findings: ${integrityResult.orphanFindings}.

Queue wait and processing durations: ${configuration.queueMetrics}.

${environmentMarkdown(environment)}
`;
if (LABEL === "smoke") {
  // Pipeline check only: nothing is saved as evidence.
  console.log(markdown);
  process.exit(0);
}
const saved = saveRecord(
  {
    benchmark: "Benchmark B: audit API performance",
    status: exitStatus === 0 ? "COMPLETED" : "FAILED",
    reason: exitStatus === 0 ? null : "k6 exited with a non-zero status; see results",
    environment,
    configuration,
    results: { levels: results, integrity: integrityResult },
    errorCount: results.reduce((s, r) => s + Math.round((r.errorRatePercent / 100) * r.requests), 0),
    exitStatus,
  },
  markdown,
);
console.log(markdown);
console.log(`Saved ${saved.json}`);
