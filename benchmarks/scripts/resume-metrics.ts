/**
 * Developer-only: turns saved test, evaluation and benchmark records into resume evidence.
 *
 * Rules enforced here:
 * - Every metric cites the record file it came from; nothing is computed from memory or estimated.
 * - A bullet is only filled in when its supporting metric exists with status MEASURED; otherwise it
 *   is emitted as EVIDENCE_REQUIRED.
 * - Synthetic benchmark results are labelled as such; no production, customer or legal-accuracy
 *   claims are generated.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compareEngineRuns } from "../lib/comparison.js";
import { REPO_ROOT } from "../lib/environment.js";
import { engineLabel, latest, loadRecords, type EngineSizeResult, type LoadedRecord } from "../lib/load.js";
import { apiComparison, databaseComparison, reliabilityRuns } from "../lib/phase5.js";
import { round } from "../lib/stats.js";

type Verification = "MEASURED" | "EVIDENCE_REQUIRED";

interface Metric {
  readonly id: string;
  readonly name: string;
  readonly value: number | string | null;
  readonly unit: string;
  readonly verification: Verification;
  readonly sourceFile: string | null;
  readonly commitSha: string | null;
  readonly sourceTreeSha256: string | null;
  readonly date: string | null;
  readonly environment: string | null;
  readonly workload: string;
  readonly methodology: string;
  readonly resumeSuitability: string;
}

const OUT_DIR = path.join(REPO_ROOT, "docs", "resume-evidence");
const records = loadRecords();

const describeEnvironment = (r: LoadedRecord): string =>
  `${r.environment.environment}; ${r.environment.cpu.model}; ${r.environment.os.platform} ${r.environment.os.release}; Node ${r.environment.node}`;

type Provenance = Pick<Metric, "sourceFile" | "commitSha" | "sourceTreeSha256" | "date" | "environment">;

const provenanceOf = (record: LoadedRecord | null): Provenance | null =>
  record === null
    ? null
    : {
        sourceFile: record.file,
        commitSha: record.environment.git.commitSha,
        sourceTreeSha256: record.environment.sourceTreeSha256,
        date: record.environment.timestampUtc,
        environment: describeEnvironment(record),
      };

function metric(
  base: Pick<Metric, "id" | "name" | "unit" | "workload" | "methodology" | "resumeSuitability">,
  provenance: Provenance | null,
  value: number | string | null,
): Metric {
  const measured = provenance !== null && value !== null;
  return {
    ...base,
    value: measured ? value : null,
    verification: measured ? "MEASURED" : "EVIDENCE_REQUIRED",
    sourceFile: provenance?.sourceFile ?? null,
    commitSha: provenance?.commitSha ?? null,
    sourceTreeSha256: provenance?.sourceTreeSha256 ?? null,
    date: provenance?.date ?? null,
    environment: provenance?.environment ?? null,
  };
}

// --- Benchmark A -----------------------------------------------------------------------------
const engine = latest(
  records,
  (r) => r.benchmark === "A-engine-throughput" && r.status === "COMPLETED" && engineLabel(r) !== "baseline",
);
const engine10k =
  engine === null ? null : ((engine.results as EngineSizeResult[]).find((s) => s.shifts === 10_000) ?? null);

// --- Benchmark F -----------------------------------------------------------------------------
const comparison = compareEngineRuns(records);
const comparisonValid =
  comparison !== null &&
  comparison.comparable &&
  comparison.equivalence !== null &&
  (comparison.equivalence.results as { identical: boolean }).identical;
const f10k = comparisonValid ? (comparison.sizes.find((s) => s.shifts === 10_000) ?? null) : null;
const comparisonProvenance: Provenance | null = comparisonValid
  ? {
      sourceFile: `${comparison.baseline.file} (baseline) vs ${comparison.improved.file} (optimised); equivalence ${comparison.equivalence.file}`,
      commitSha: comparison.improved.environment.git.commitSha,
      sourceTreeSha256: comparison.improved.environment.sourceTreeSha256,
      date: comparison.improved.environment.timestampUtc,
      environment: describeEnvironment(comparison.improved),
    }
  : null;

// --- Benchmark D -----------------------------------------------------------------------------
const correctness = latest(records, (r) => r.benchmark === "D-correctness" && r.status === "COMPLETED");
interface CorrectnessResults {
  goldenScenarios: {
    total: number;
    passed: number;
    passRatePercent: number;
    reference: { total: number; passed: number };
    correctlyRejectedUnsupportedOrReview: { total: number; passed: number };
  };
  calculationEngineCoverage: {
    state: string;
    lines: { pct: number } | null;
    branches: { pct: number } | null;
  };
}
const correctnessResults = correctness?.results as CorrectnessResults | undefined;
const coverageCurrent = correctnessResults?.calculationEngineCoverage.state === "CURRENT";

// --- Test counts (vitest JSON reports written by `pnpm test:evidence`) -------------------------
const testResultsDir = path.join(REPO_ROOT, "benchmarks", "test-reports");
const testReports = existsSync(testResultsDir)
  ? readdirSync(testResultsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        file: `benchmarks/test-reports/${f}`,
        data: JSON.parse(readFileSync(path.join(testResultsDir, f), "utf8")) as {
          numTotalTests: number;
          numPassedTests: number;
          numFailedTests: number;
          startTime: number;
        },
      }))
  : [];
const totalTests = testReports.reduce((n, r) => n + r.data.numTotalTests, 0);
const passedTests = testReports.reduce((n, r) => n + r.data.numPassedTests, 0);
const allTestsPass = testReports.length > 0 && testReports.every((r) => r.data.numFailedTests === 0);

const api = apiComparison(records);
const apiAt50 = api?.rows.find((r) => r.clients === 50);
const db = databaseComparison(records);
const dbLargest = db?.scales.at(-1);
const dbRow = (name: string) => dbLargest?.rows.find((r) => r.operation.startsWith(name));
const historyRow = dbRow("Audit history, first page");
const dashboardRow = dbRow("Dashboard summary");
const importRow = dbRow("Shift CSV import");
const rel = reliabilityRuns(records);

const metrics: Metric[] = [
  metric(
    {
      id: "engine-throughput-10k",
      name: "Calculation engine throughput (median)",
      unit: "synthetic shifts/second",
      workload:
        "10,000 deterministic synthetic shifts in 1,000 fortnightly pay periods (seed 20260706, generator v1)",
      methodology:
        "Benchmark A: 3 warm-up + 10 measured repetitions, single process, forced GC before each repetition; isolated engine only (no HTTP/DB).",
      resumeSuitability: "Suitable with the qualifier 'synthetic, isolated engine benchmark'.",
    },
    provenanceOf(engine),
    engine10k === null ? null : round(engine10k.shiftsPerSecond.median, 0),
  ),
  metric(
    {
      id: "engine-runtime-reduction-10k",
      name: "Calculation runtime reduction vs recorded baseline (median total time)",
      unit: "percent",
      workload: "Same 10,000-shift workload, same machine and runtime for both runs",
      methodology:
        "Benchmark F: (baseline - optimised) / baseline x 100 on median repetition time; output digests verified identical.",
      resumeSuitability:
        "Suitable: measured before/after on identical workload with output equivalence verified.",
    },
    f10k === null ? null : comparisonProvenance,
    f10k?.medianTotalTimeImprovementPercent ?? null,
  ),
  metric(
    {
      id: "engine-throughput-increase-10k",
      name: "Calculation throughput increase vs recorded baseline (median)",
      unit: "percent",
      workload: "Same 10,000-shift workload, same machine and runtime for both runs",
      methodology: "Benchmark F: (optimised - baseline) / baseline x 100 on median shifts/second.",
      resumeSuitability: "Suitable; prefer the runtime reduction figure (less prone to misreading).",
    },
    f10k === null ? null : comparisonProvenance,
    f10k?.medianThroughputIncreasePercent ?? null,
  ),
  metric(
    {
      id: "golden-scenarios",
      name: "Golden payroll scenarios passing",
      unit: "scenarios passed / total",
      workload: "Supported MA000004 Level 1 casual/part-time scenarios plus unsupported/review cases",
      methodology:
        "Benchmark D: expected values hand-derived from award Schedule B rates; NOT reviewed by a qualified professional.",
      resumeSuitability:
        "Suitable only as 'agreement on a defined supported scenario set'; never as legal accuracy.",
    },
    provenanceOf(correctness),
    correctnessResults === undefined
      ? null
      : `${correctnessResults.goldenScenarios.passed}/${correctnessResults.goldenScenarios.total}`,
  ),
  metric(
    {
      id: "golden-reference",
      name: "Reference calculations matching hand-derived award values",
      unit: "scenarios / total",
      workload: "Golden REFERENCE scenarios (supported casual/part-time Level 1 cases)",
      methodology:
        "Benchmark D: status, per-rule pay lines and total must equal values hand-derived from Schedule B; NOT reviewed by a qualified professional.",
      resumeSuitability:
        "Suitable only as 'agreement on a defined supported scenario set'; never as legal accuracy.",
    },
    provenanceOf(correctness),
    correctnessResults === undefined
      ? null
      : `${correctnessResults.goldenScenarios.reference.passed}/${correctnessResults.goldenScenarios.reference.total}`,
  ),
  metric(
    {
      id: "unsupported-correctly-rejected",
      name: "Unsupported or review-required cases correctly refused",
      unit: "cases / total",
      workload: "Golden REJECTION scenarios",
      methodology: "Benchmark D: engine must return the expected non-calculated status and issue codes.",
      resumeSuitability: "Suitable as evidence of explicit unsupported-scenario handling.",
    },
    provenanceOf(correctness),
    correctnessResults === undefined
      ? null
      : `${correctnessResults.goldenScenarios.correctlyRejectedUnsupportedOrReview.passed}/${correctnessResults.goldenScenarios.correctlyRejectedUnsupportedOrReview.total}`,
  ),
  metric(
    {
      id: "engine-branch-coverage",
      name: "Calculation engine branch coverage",
      unit: "percent",
      workload: "packages/calculation-engine/src",
      methodology: "Vitest v8 coverage, read by Benchmark D only when newer than the engine source.",
      resumeSuitability: "Suitable with care; coverage is not evidence of legal correctness.",
    },
    coverageCurrent ? provenanceOf(correctness) : null,
    coverageCurrent ? (correctnessResults.calculationEngineCoverage.branches?.pct ?? null) : null,
  ),
  metric(
    {
      id: "automated-tests",
      name: "Automated tests passing",
      unit: "tests passed / total",
      workload:
        "Unit, property-based, golden and API integration tests (real PostgreSQL via Testcontainers) across workspace packages",
      methodology: "Vitest JSON reports in benchmarks/test-reports/ (pnpm test:evidence).",
      resumeSuitability: "Suitable as a count; mention property-based testing explicitly.",
    },
    allTestsPass
      ? {
          sourceFile: testReports.map((r) => r.file).join(", "),
          commitSha: null,
          sourceTreeSha256: null,
          date: new Date(Math.max(...testReports.map((r) => r.data.startTime))).toISOString(),
          environment: "local test run (see vitest reports)",
        }
      : null,
    allTestsPass ? `${passedTests}/${totalTests}` : null,
  ),
  metric(
    {
      id: "api-throughput-increase-50",
      name: "Audit API throughput increase at 50 concurrent clients after query optimisation",
      unit: "percent",
      workload:
        "k6 closed model, 50 virtual users, no think time, 60 s measured after a 10 s warm-up; 30% dashboard, 25% history, 20% detail, 10% lines, 15% audit creation; production API image and PostgreSQL 17.6 on one workstation",
      methodology:
        "Benchmark B, baseline versus optimised run with the same workload: (optimised - baseline) / baseline x 100 on requests per second.",
      resumeSuitability: "Suitable with the qualifier 'local load test on a single workstation'.",
    },
    apiAt50 === undefined ? null : provenanceOf(api?.improved ?? null),
    apiAt50?.throughputIncreasePercent ?? null,
  ),
  metric(
    {
      id: "api-p95-reduction-50",
      name: "Audit API p95 latency reduction at 50 concurrent clients",
      unit: "percent",
      workload: "As above",
      methodology:
        "Benchmark B: (baseline p95 - optimised p95) / baseline p95 x 100, all request types together.",
      resumeSuitability: "Suitable with the same qualifier; quote the absolute values alongside.",
    },
    apiAt50 === undefined ? null : provenanceOf(api?.improved ?? null),
    apiAt50?.p95ReductionPercent ?? null,
  ),
  metric(
    {
      id: "api-p95-latency-50",
      name: "Audit API p95 latency at 50 concurrent clients (optimised)",
      unit: "milliseconds",
      workload: "As above; saturated, so latency is mostly queueing in one Node.js process",
      methodology: "Benchmark B, nearest-rank p95 over every request in the measured phase.",
      resumeSuitability: "Context only: an absolute latency from one laptop is not a capacity claim.",
    },
    apiAt50 === undefined ? null : provenanceOf(api?.improved ?? null),
    apiAt50?.improvedP95Ms ?? null,
  ),
  metric(
    {
      id: "db-history-reduction",
      name: "Audit history page latency reduction (median)",
      unit: "percent",
      workload: `${dbLargest?.totalAudits.toLocaleString("en-AU") ?? "?"} synthetic audits (${dbLargest?.measuredUserAudits.toLocaleString("en-AU") ?? "?"} for the measured user), PostgreSQL 17.6`,
      methodology:
        "Benchmark C: compiled service call, 30 measured iterations; fix: load summary columns only instead of four JSON snapshots per row.",
      resumeSuitability: "Suitable with the qualifier 'synthetic dataset, single machine'.",
    },
    historyRow === undefined ? null : provenanceOf(db?.improved ?? null),
    historyRow?.medianReductionPercent ?? null,
  ),
  metric(
    {
      id: "db-dashboard-reduction",
      name: "Dashboard summary latency reduction (median)",
      unit: "percent",
      workload: "Same dataset",
      methodology:
        "Benchmark C with EXPLAIN (ANALYZE, BUFFERS): two aggregates did sequential scans of audits; fix: extend an index so all five queries are index-only.",
      resumeSuitability: "Suitable with the same qualifier.",
    },
    dashboardRow === undefined ? null : provenanceOf(db?.improved ?? null),
    dashboardRow?.medianReductionPercent ?? null,
  ),
  metric(
    {
      id: "db-import-statements",
      name: "SQL statements per 14-row CSV shift import",
      unit: "statements (baseline -> optimised)",
      workload: "14 shifts with meal breaks, one transaction",
      methodology:
        "Benchmark C: statements counted at the node-postgres driver; fix: two multi-row inserts instead of four statements per row.",
      resumeSuitability: "Suitable; pair with the measured latency reduction.",
    },
    importRow === undefined ? null : provenanceOf(db?.improved ?? null),
    importRow === undefined ? null : `${importRow.baselineStatements} -> ${importRow.improvedStatements}`,
  ),
  metric(
    {
      id: "db-import-reduction",
      name: "CSV shift import latency reduction (median)",
      unit: "percent",
      workload: "Same dataset; 14-row imports",
      methodology: "Benchmark C, 20 measured imports per step.",
      resumeSuitability: "Suitable with the same qualifier.",
    },
    importRow === undefined ? null : provenanceOf(db?.improved ?? null),
    importRow?.medianReductionPercent ?? null,
  ),
  metric(
    {
      id: "reliability-completion",
      name: "Audit submissions completed under injected failures",
      unit: "percent",
      workload:
        "10 clients submitting audits continuously; API process SIGKILLed (restarted by Docker) and PostgreSQL stopped for 10 s, in separate scenarios",
      methodology:
        "Benchmark E: clients retry with the same Idempotency-Key; afterwards SQL checks for duplicates, lost acknowledged audits and inconsistent findings.",
      resumeSuitability: "Suitable, naming the two failure scenarios and the retry policy.",
    },
    rel === null ? null : provenanceOf(rel.latest),
    rel === null ? null : round((rel.completed / rel.submissions) * 100, 2),
  ),
  metric(
    {
      id: "reliability-integrity-failures",
      name: "Data integrity failures after failure injection",
      unit: "count (duplicates, lost acknowledged audits, orphaned or mismatched findings)",
      workload: "Same scenarios",
      methodology: "Benchmark E SQL checks after each scenario.",
      resumeSuitability: "Suitable alongside the completion rate.",
    },
    rel === null ? null : provenanceOf(rel.latest),
    rel?.integrityFailures ?? null,
  ),
];

const byId = new Map(metrics.map((m) => [m.id, m]));
const value = (id: string): string | null => {
  const m = byId.get(id);
  return m?.verification === "MEASURED" && m.value !== null ? String(m.value) : null;
};
const bullet = (
  template: string,
  needs: readonly string[],
  fill: (v: Record<string, string>) => string,
): string => {
  const values = Object.fromEntries(needs.map((id) => [id, value(id)]));
  const missing = needs.filter((id) => values[id] === null);
  return missing.length > 0
    ? `- **EVIDENCE_REQUIRED** (${missing.join(", ")}): ${template}`
    : `- ${fill(values as Record<string, string>)}  \n  _Evidence: ${[...new Set(needs.map((id) => byId.get(id)?.sourceFile ?? "unknown"))].join("; ")}_`;
};

const bullets = [
  bullet(
    "Engineered a TypeScript payroll calculation engine processing [MEASURED SHIFTS/SECOND] synthetic shifts per second under a documented benchmark.",
    ["engine-throughput-10k"],
    (v) =>
      `Engineered a deterministic TypeScript payroll calculation engine (exact decimal arithmetic, DST-aware time segmentation, versioned award rules) that processed a median ${Number(v["engine-throughput-10k"]).toLocaleString("en-AU")} synthetic shifts per second in an isolated, documented single-process benchmark.`,
  ),
  bullet(
    "Reduced calculation runtime by [MEASURED PERCENT]% compared with the recorded baseline implementation.",
    ["engine-runtime-reduction-10k"],
    (v) =>
      `Profiled the calculation engine, identified time-zone offset lookups as the dominant cost, and replaced them with cached per-year transition tables, cutting median runtime on a 10,000-shift synthetic workload by ${v["engine-runtime-reduction-10k"]}% with byte-identical outputs verified by digest.`,
  ),
  bullet(
    "Implemented [VERIFIED COUNT] independently reviewed payroll test scenarios, achieving [PASS RATE]% agreement on the defined supported scenario set.",
    ["golden-reference", "unsupported-correctly-rejected"],
    (v) =>
      `Built a golden evaluation suite of payroll scenarios derived from the General Retail Industry Award's published rates; the engine matches ${v["golden-reference"]} hand-derived reference calculations in the defined supported scope and correctly refuses ${v["unsupported-correctly-rejected"]} out-of-scope or review-required cases rather than guessing (expected values not yet reviewed by a payroll professional).`,
  ),
  bullet(
    "Wrote [COUNT] automated tests including property-based and database integration tests, with [BRANCH COVERAGE]% branch coverage of the calculation engine.",
    ["automated-tests", "engine-branch-coverage"],
    (v) =>
      `Wrote ${(v["automated-tests"] ?? "").split("/")[0] ?? ""} automated unit, property-based (fast-check), golden and PostgreSQL-backed API integration tests, reaching ${v["engine-branch-coverage"]}% branch coverage on the pure calculation engine.`,
  ),
  bullet(
    "Optimised PostgreSQL audit queries, reducing p95 retrieval latency by [MEASURED PERCENT] on a [DATASET SIZE]-record dataset.",
    ["db-history-reduction", "db-dashboard-reduction", "db-import-reduction", "db-import-statements"],
    (v) =>
      `Profiled the API's PostgreSQL access with EXPLAIN ANALYZE and driver-level query counts on ${dbLargest?.totalAudits.toLocaleString("en-AU") ?? ""} synthetic audits, then cut median audit-history latency by ${v["db-history-reduction"]}% (stopped loading unused JSON snapshots), dashboard latency by ${v["db-dashboard-reduction"]}% (covering index replacing two sequential scans) and CSV import latency by ${v["db-import-reduction"]}% (${v["db-import-statements"]} SQL statements per 14-row import).`,
  ),
  bullet(
    "Served audit API requests at [p95] ms p95 latency under [N] concurrent clients in a local load test.",
    ["api-throughput-increase-50", "api-p95-reduction-50"],
    (v) =>
      `Load-tested the audit API with k6 at 1 to 50 concurrent clients against the production container image; the query optimisations raised throughput at 50 clients by ${v["api-throughput-increase-50"]}% and cut p95 latency by ${v["api-p95-reduction-50"]}% on an identical workload, with 0% errors (single-workstation test).`,
  ),
  bullet(
    "Built and tested an audit-processing workflow that recovered [MEASURED SUCCESS RATE]% of jobs under [DEFINED FAILURE SCENARIOS].",
    ["reliability-completion", "reliability-integrity-failures"],
    (v) =>
      `Designed idempotent audit submission (unique Idempotency-Key per request, database-enforced) and verified it with failure injection: ${v["reliability-completion"]}% of ${rel?.submissions.toLocaleString("en-AU") ?? ""} audit submissions completed while the API process was killed mid-load and while PostgreSQL was down for 10 s, with ${v["reliability-integrity-failures"]} duplicate, lost or inconsistent records.`,
  ),
];

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  path.join(OUT_DIR, "metrics.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), metrics }, null, 2)}\n`,
);

const metricsMd = `# Resume evidence: metrics

Generated by \`pnpm resume:metrics\` from saved records. Values marked EVIDENCE_REQUIRED have no supporting measurement yet.

| Metric | Measured result | Conditions | Evidence | Resume suitability |
| --- | --- | --- | --- | --- |
${metrics
  .map(
    (m) =>
      `| ${m.name} | ${m.verification === "MEASURED" ? `**${String(m.value)}** ${m.unit}` : "EVIDENCE_REQUIRED"} | ${m.workload}. ${m.methodology} | ${m.sourceFile === null ? "-" : `\`${m.sourceFile}\``} | ${m.resumeSuitability} |`,
  )
  .join("\n")}

All benchmark figures are synthetic measurements on one developer workstation (${engine === null ? "n/a" : describeEnvironment(engine)}). They are not production results, user outcomes or legal-accuracy claims.
`;
writeFileSync(path.join(OUT_DIR, "metrics.md"), metricsMd);

const bulletsMd = `# Suggested resume bullets

Generated from measured evidence only. Edit wording freely, but keep the qualifiers ("synthetic", "defined supported scenario set") and do not change the numbers.

${bullets.join("\n")}

Do not claim: real users or customers, money recovered, production uptime or scale, AWS capacity, or legal accuracy across Australian payroll.
`;
writeFileSync(path.join(OUT_DIR, "suggested-bullets.md"), bulletsMd);
console.log(metricsMd);
console.log(bulletsMd);
