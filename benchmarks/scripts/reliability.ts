/**
 * Benchmark E: reliability and recovery.
 *
 *   BENCHMARK_LABEL=baseline pnpm benchmark:reliability
 *
 * Runs against the isolated stack in benchmarks/k6/docker-compose.yml (production API image,
 * PostgreSQL 17.6), using a client on the host that behaves like a careful real client: every
 * logical audit submission has its own Idempotency-Key and is retried with the same key on network
 * errors and 5xx responses (exponential backoff, 250 ms to 2 s) for up to 60 s.
 *
 * Failure injection (exact commands are recorded in the report):
 * - duplicates: the same key sent 20 times in sequence, 50 times concurrently, and once with a
 *   different request body;
 * - API crash: SIGKILL to the Node process inside the API container under load; Docker's restart
 *   policy (on-failure) brings the container back, as a process supervisor would;
 * - database outage: `docker stop` on PostgreSQL under load for 10 s, then `docker start`.
 *
 * After each scenario, SQL checks count duplicates, acknowledged audits that are missing, orphaned
 * findings, and findings rows that disagree with the stored reconciliation snapshot.
 *
 * Audits are processed synchronously inside the request (ADR 0010), so there is no queue or
 * separate worker: the brief's queue scenarios are recorded as not applicable, and "worker restart
 * during processing" is the API process being killed mid-request.
 */
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { REPO_ROOT, captureEnvironment, sampleCpuBusyPercent } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";
import { distribution, round } from "../lib/stats.js";

const LABEL = process.env["BENCHMARK_LABEL"] ?? "unlabelled";
const API = "http://127.0.0.1:3101/api/v1";
const ORIGIN = "http://localhost:3000";
const COMPOSE = ["compose", "-f", `${REPO_ROOT}/benchmarks/k6/docker-compose.yml`];
const CLIENTS = 10;
const WARM_SECONDS = 10;
const AFTER_FAULT_SECONDS = 30;
const OUTAGE_SECONDS = 10;
const RETRY_BUDGET_MS = 60_000;
const API_CONTAINER = "wageguard-bench-api-1";
const DB_CONTAINER = "wageguard-bench-postgres-1";

const docker = (args: string[]): string =>
  execFileSync("docker", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const psql = (sql: string): string =>
  docker(["exec", DB_CONTAINER, "psql", "-U", "wageguard", "-d", "wageguard", "-tAc", sql]).trim();

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

interface Account {
  readonly cookie: string;
  readonly employmentId: string;
  readonly payslipId: string;
}

async function call(
  method: string,
  path: string,
  options: { cookie?: string; body?: string; type?: string; key?: string } = {},
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(options.cookie === undefined ? {} : { Cookie: options.cookie }),
      ...(options.type === undefined ? {} : { "Content-Type": options.type }),
      ...(options.key === undefined ? {} : { "Idempotency-Key": options.key }),
    },
    ...(options.body === undefined ? {} : { body: options.body }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function json<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

const SHIFTS_CSV = [
  "start,end,meal_start,meal_end",
  "2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30",
  "2026-07-11T08:00,2026-07-11T16:30,2026-07-11T12:00,2026-07-11T12:30",
  "2026-07-12T10:00,2026-07-12T16:00,2026-07-12T13:00,2026-07-12T13:30",
  "",
].join("\n");

async function createAccount(index: number): Promise<Account> {
  const register = await call("POST", "/auth/register", {
    type: "application/json",
    body: JSON.stringify({
      email: `reliability-${Date.now()}-${index}@bench.example`,
      password: "benchmark only passphrase",
    }),
  });
  await json(register, "register");
  const cookie = (register.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const employment = await json<{ id: string }>(
    await call("POST", "/employments", {
      cookie,
      type: "application/json",
      body: JSON.stringify({
        label: `Reliability job ${index}`,
        awardCode: "MA000004",
        classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
        employmentType: "CASUAL",
        timeZone: "Australia/Sydney",
        declarations: {
          awardCoverage: "CONFIRMED",
          enterpriseAgreement: "NONE",
          ageBand: "ADULT_21_PLUS",
          shiftworker: "NO",
        },
      }),
    }),
    "employment",
  );
  await json(
    await call("POST", `/shifts/import?employmentId=${employment.id}`, {
      cookie,
      type: "text/csv",
      body: SHIFTS_CSV,
    }),
    "import",
  );
  const payslip = await json<{ id: string }>(
    await call("POST", "/payslips", {
      cookie,
      type: "application/json",
      body: JSON.stringify({
        employmentId: employment.id,
        payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
        grossPay: "862.15",
        lines: [],
      }),
    }),
    "payslip",
  );
  return { cookie, employmentId: employment.id, payslipId: payslip.id };
}

interface Submission {
  readonly key: string;
  readonly startedMs: number;
  finishedMs: number;
  attempts: number;
  outcome: "created" | "replayed" | "failed";
  auditId: string | null;
  readonly attemptStatuses: string[];
}

/** One logical audit submission: same key on every attempt, retried on network errors and 5xx. */
async function submit(account: Account, key: string, clock: () => number): Promise<Submission> {
  const submission: Submission = {
    key,
    startedMs: clock(),
    finishedMs: 0,
    attempts: 0,
    outcome: "failed",
    auditId: null,
    attemptStatuses: [],
  };
  let backoff = 250;
  while (clock() - submission.startedMs < RETRY_BUDGET_MS) {
    submission.attempts += 1;
    try {
      const response = await call("POST", "/audits", {
        cookie: account.cookie,
        type: "application/json",
        key,
        body: JSON.stringify({ employmentId: account.employmentId, payslipId: account.payslipId }),
      });
      submission.attemptStatuses.push(String(response.status));
      if (response.status === 201 || response.status === 200) {
        const body = (await response.json()) as { id: string };
        submission.auditId = body.id;
        submission.outcome = response.headers.get("idempotent-replayed") === "true" ? "replayed" : "created";
        break;
      }
      await response.body?.cancel();
      if (response.status < 500) {
        break; // client errors are not retried
      }
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "Error";
      // fetch reports a refused or reset connection as TypeError; AbortSignal.timeout as TimeoutError.
      submission.attemptStatuses.push(
        name === "TimeoutError" ? "client timeout (10 s)" : name === "TypeError" ? "network error" : name,
      );
    }
    await sleep(backoff);
    backoff = Math.min(2_000, backoff * 2);
  }
  submission.finishedMs = clock();
  return submission;
}

// ---------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------

interface Integrity {
  readonly auditsStored: number;
  readonly duplicateKeys: number;
  readonly acknowledgedButMissing: number;
  readonly orphanFindings: number;
  readonly findingsMismatches: number;
  readonly notCompleted: number;
}

function checkIntegrity(acknowledgedIds: readonly string[]): Integrity {
  // Compared in the script: thousands of ids would not fit on a `docker exec` command line.
  const stored = new Set(
    psql("SELECT id FROM audits")
      .split("\n")
      .map((line) => line.trim()),
  );
  const missing = acknowledgedIds.filter((id) => !stored.has(id)).length;
  return {
    auditsStored: Number(psql("SELECT count(*) FROM audits")),
    duplicateKeys: Number(psql("SELECT count(*) - count(DISTINCT (user_id, idempotency_key)) FROM audits")),
    acknowledgedButMissing: missing,
    orphanFindings: Number(
      psql(
        "SELECT count(*) FROM audit_findings f WHERE NOT EXISTS (SELECT 1 FROM audits a WHERE a.id = f.audit_id)",
      ),
    ),
    findingsMismatches: Number(
      psql(
        `SELECT count(*) FROM audits a
         WHERE (SELECT count(*) FROM audit_findings f WHERE f.audit_id = a.id)
               <> jsonb_array_length(a.reconciliation -> 'findings')`,
      ),
    ),
    notCompleted: Number(psql("SELECT count(*) FROM audits WHERE status <> 'COMPLETED'")),
  };
}

async function waitForApi(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${API}/ready`, { signal: AbortSignal.timeout(1_000) })).ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error("API did not become ready");
}

async function duplicateScenario(account: Account) {
  const clock = () => performance.now();
  // Sequential retries of one logical request.
  const sequentialKey = `dup-seq-${Date.now()}`;
  const sequential = [];
  for (let i = 0; i < 20; i += 1) {
    sequential.push(await submit(account, sequentialKey, clock));
  }
  // Concurrent identical requests racing for one key.
  const concurrentKey = `dup-par-${Date.now()}`;
  const concurrent = await Promise.all(
    Array.from({ length: 50 }, () => submit(account, concurrentKey, clock)),
  );
  // Reusing a key for a different request must be refused, not silently replayed.
  const reuse = await call("POST", "/audits", {
    cookie: account.cookie,
    type: "application/json",
    key: sequentialKey,
    body: JSON.stringify({
      employmentId: account.employmentId,
      payslipId: account.payslipId,
      declaredPublicHolidays: ["2026-07-07"],
    }),
  });
  await reuse.body?.cancel();
  const stored = (key: string) =>
    Number(psql(`SELECT count(*) FROM audits WHERE idempotency_key = '${key}'`));
  return {
    sequential: {
      requests: sequential.length,
      created: sequential.filter((s) => s.outcome === "created").length,
      replayed: sequential.filter((s) => s.outcome === "replayed").length,
      distinctAuditIds: new Set(sequential.map((s) => s.auditId)).size,
      auditsStored: stored(sequentialKey),
    },
    concurrent: {
      requests: concurrent.length,
      created: concurrent.filter((s) => s.outcome === "created").length,
      replayed: concurrent.filter((s) => s.outcome === "replayed").length,
      failed: concurrent.filter((s) => s.outcome === "failed").length,
      distinctAuditIds: new Set(concurrent.map((s) => s.auditId)).size,
      auditsStored: stored(concurrentKey),
    },
    keyReuseWithDifferentBody: { status: reuse.status },
  };
}

interface FaultTimeline {
  readonly faultStartMs: number;
  readonly faultEndMs: number;
}

/** Runs CLIENTS workers submitting audits back to back while `inject` performs the fault. */
async function underLoad(
  name: string,
  accounts: readonly Account[],
  inject: (t0: number) => Promise<FaultTimeline>,
) {
  const t0 = performance.now();
  const clock = () => performance.now() - t0;
  const submissions: Submission[] = [];
  let stop = false;
  const workers = accounts.map(async (account, w) => {
    let n = 0;
    while (!stop) {
      submissions.push(await submit(account, `${name}-${w}-${n}`, clock));
      n += 1;
    }
  });
  await sleep(WARM_SECONDS * 1000);
  const timeline = await inject(t0);
  await sleep(AFTER_FAULT_SECONDS * 1000);
  stop = true;
  await Promise.all(workers);

  const succeeded = submissions.filter((s) => s.outcome !== "failed");
  // User-visible outage: the longest stretch around the fault in which no audit completed. Requests
  // that were already in flight can complete just after the injection command is issued, so "first
  // success after injection" would understate it.
  const completions = succeeded.map((s) => s.finishedMs).sort((a, b) => a - b);
  let outage = { from: timeline.faultStartMs, to: timeline.faultStartMs };
  for (let i = 1; i < completions.length; i += 1) {
    const from = completions[i - 1] as number;
    const to = completions[i] as number;
    const overlapsFault = to >= timeline.faultStartMs && from <= timeline.faultEndMs + 1_000;
    if (overlapsFault && to - from > outage.to - outage.from) {
      outage = { from, to };
    }
  }
  const startedAfterRecovery = submissions.filter((s) => s.startedMs >= timeline.faultEndMs + 5_000);
  const affected = submissions.filter((s) => s.attempts > 1);
  const statusCounts: Record<string, number> = {};
  for (const s of submissions) {
    for (const status of s.attemptStatuses) {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
  }
  return {
    logicalSubmissions: submissions.length,
    completed: succeeded.length,
    failed: submissions.length - succeeded.length,
    successRatePercent: round((succeeded.length / submissions.length) * 100, 3),
    replayedAfterLostResponse: submissions.filter((s) => s.outcome === "replayed").length,
    submissionsThatNeededRetries: affected.length,
    totalAttempts: submissions.reduce((sum, s) => sum + s.attempts, 0),
    attemptStatusCounts: statusCounts,
    faultStartSeconds: round(timeline.faultStartMs / 1000, 2),
    faultEndSeconds: round(timeline.faultEndMs / 1000, 2),
    longestStretchWithoutCompletionsSeconds: round((outage.to - outage.from) / 1000, 2),
    completionsResumedSecondsAfterInjection: round((outage.to - timeline.faultStartMs) / 1000, 2),
    completionsResumedSecondsAfterFaultEnd: round((outage.to - timeline.faultEndMs) / 1000, 2),
    successRateAfterRecoveryPercent:
      startedAfterRecovery.length === 0
        ? null
        : round(
            (startedAfterRecovery.filter((s) => s.outcome !== "failed").length /
              startedAfterRecovery.length) *
              100,
            3,
          ),
    retriedSubmissionLatencyMs:
      affected.length === 0 ? null : distribution(affected.map((s) => s.finishedMs - s.startedMs)),
    integrity: checkIntegrity(succeeded.map((s) => s.auditId as string)),
  };
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

const cpuBusyPercentAtStart = await sampleCpuBusyPercent();
console.log(`CPU busy before start: ${cpuBusyPercentAtStart}%`);
docker([...COMPOSE, "down", "-v", "--remove-orphans"]);
execFileSync("docker", [...COMPOSE, "up", "-d", "--build", "--wait", "api"], {
  cwd: REPO_ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

const procedures = {
  apiCrash: `docker exec ${API_CONTAINER} sh -c "kill -9 $(pidof node)" (the container exits; restart policy on-failure restarts it)`,
  databaseOutage: `docker stop ${DB_CONTAINER}; wait ${OUTAGE_SECONDS} s; docker start ${DB_CONTAINER}`,
};
let results;
try {
  await waitForApi();
  console.log("Creating accounts...");
  const accounts: Account[] = [];
  for (let i = 0; i < CLIENTS; i += 1) {
    accounts.push(await createAccount(i));
  }

  console.log("Scenario: duplicate submissions...");
  const duplicates = await duplicateScenario(accounts[0] as Account);

  console.log("Scenario: API process killed under load...");
  const apiCrash = await underLoad("crash", accounts, async (t0) => {
    const faultStartMs = performance.now() - t0;
    docker(["exec", API_CONTAINER, "sh", "-c", "kill -9 $(pidof node)"]);
    await waitForApi();
    return { faultStartMs, faultEndMs: performance.now() - t0 };
  });

  console.log("Scenario: database unavailable under load...");
  const databaseOutage = await underLoad("dbdown", accounts, async (t0) => {
    const faultStartMs = performance.now() - t0;
    docker(["stop", DB_CONTAINER]);
    await sleep(OUTAGE_SECONDS * 1000);
    docker(["start", DB_CONTAINER]);
    return { faultStartMs, faultEndMs: performance.now() - t0 };
  });

  const restarts = Number(docker(["inspect", API_CONTAINER, "--format", "{{.RestartCount}}"]).trim());
  results = { duplicates, apiCrash, apiRestartCount: restarts, databaseOutage };
} finally {
  docker([...COMPOSE, "down", "-v", "--remove-orphans"]);
}

const environment = captureEnvironment("reliability", { postgresVersion: "17.6", cpuBusyPercentAtStart });
const configuration = {
  label: LABEL,
  clients: CLIENTS,
  warmSeconds: WARM_SECONDS,
  afterFaultSeconds: AFTER_FAULT_SECONDS,
  outageSeconds: OUTAGE_SECONDS,
  retryPolicy:
    "Same Idempotency-Key on every attempt; retry network errors and 5xx; backoff 250 ms doubling to 2 s; give up after 60 s",
  failureInjection: procedures,
  notApplicable: {
    "Transient queue failure": "No queue: audits are processed synchronously in the request (ADR 0010).",
    "Queue wait and job processing durations": "No queue or background worker.",
  },
};

const s = (r: Awaited<ReturnType<typeof underLoad>>, label: string) => `### ${label}

| Measure | Result |
| --- | --- |
| Logical audit submissions | ${r.logicalSubmissions} |
| Completed / failed | ${r.completed} / ${r.failed} (${r.successRatePercent}% success) |
| Needed at least one retry | ${r.submissionsThatNeededRetries} |
| Completed by replay (first response lost, audit already saved) | ${r.replayedAfterLostResponse} |
| Attempt outcomes | ${Object.entries(r.attemptStatusCounts)
  .map(([k, v]) => `${k}: ${v}`)
  .join(", ")} |
| Fault window (injection to service restored) | ${r.faultStartSeconds} s to ${r.faultEndSeconds} s |
| Longest stretch with no audit completing | ${r.longestStretchWithoutCompletionsSeconds} s |
| Completions resumed after injection / after the fault ended | ${r.completionsResumedSecondsAfterInjection} s / ${r.completionsResumedSecondsAfterFaultEnd} s |
| Success rate for submissions started 5 s after the fault ended | ${r.successRateAfterRecoveryPercent ?? "n/a"}% |
| Retried submissions, p50 / p95 time to complete | ${r.retriedSubmissionLatencyMs === null ? "n/a" : `${round(r.retriedSubmissionLatencyMs.median, 0)} / ${round(r.retriedSubmissionLatencyMs.p95, 0)} ms`} |
| Duplicate audits (same user and key) | ${r.integrity.duplicateKeys} |
| Acknowledged audits missing from the database | ${r.integrity.acknowledgedButMissing} |
| Orphaned findings / findings disagreeing with the snapshot / audits not COMPLETED | ${r.integrity.orphanFindings} / ${r.integrity.findingsMismatches} / ${r.integrity.notCompleted} |`;

const d = results.duplicates;
const markdown = `# Benchmark E: reliability and recovery (${LABEL})

${CLIENTS} clients on the host submit audits back to back against the production API image. ${configuration.retryPolicy}. Each scenario runs ${WARM_SECONDS} s of normal load, injects the fault, then continues for ${AFTER_FAULT_SECONDS} s. Integrity is checked in SQL afterwards (cumulative across scenarios).

## Duplicate submissions

| Test | Requests | Created | Replayed | Distinct audit ids returned | Audits stored |
| --- | --- | --- | --- | --- | --- |
| Same key, 20 sequential retries | ${d.sequential.requests} | ${d.sequential.created} | ${d.sequential.replayed} | ${d.sequential.distinctAuditIds} | ${d.sequential.auditsStored} |
| Same key, 50 concurrent requests | ${d.concurrent.requests} | ${d.concurrent.created} | ${d.concurrent.replayed} | ${d.concurrent.distinctAuditIds} | ${d.concurrent.auditsStored} |

The same key with a different request body returned HTTP ${d.keyReuseWithDifferentBody.status}.

## Failure scenarios

Injection: API crash: \`${procedures.apiCrash}\`. Database outage: \`${procedures.databaseOutage}\`.

${s(results.apiCrash, `API process killed (restarts: ${results.apiRestartCount})`)}

${s(results.databaseOutage, `Database unavailable for ${OUTAGE_SECONDS} s`)}

## Not applicable

${Object.entries(configuration.notApplicable)
  .map(([k, v]) => `- **${k}.** ${v}`)
  .join("\n")}

${environmentMarkdown(environment)}
`;

if (LABEL === "smoke") {
  console.log(markdown);
  process.exit(0);
}
const saved = saveRecord(
  {
    benchmark: "Benchmark E: reliability and recovery",
    status: "COMPLETED",
    reason: null,
    environment,
    configuration,
    results,
    errorCount: results.apiCrash.failed + results.databaseOutage.failed,
    exitStatus: 0,
  },
  markdown,
);
console.log(markdown);
console.log(`Saved ${saved.json}`);
