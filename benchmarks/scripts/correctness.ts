/**
 * Benchmark D: correctness evaluation against the golden scenario set, plus calculation-engine
 * coverage read from the last coverage run (packages/calculation-engine/coverage/coverage-summary.json).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { bundledRegistry } from "@wageguard/award-rules";
import { ENGINE_VERSION } from "@wageguard/calculation-engine";
import { Instant } from "@wageguard/domain";
import { evaluateGolden } from "@wageguard/test-fixtures";

import { REPO_ROOT, captureEnvironment } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";

/** The revision golden scenarios resolve to: the newest one, which no other revision supersedes. */
const RULE_SET_IN_FORCE = bundledRegistry()
  .list()
  .filter((r) => r.supersededBy === null)
  .map((r) => r.version)
  .join(", ");

const environment = captureEnvironment("correctness");
const summary = evaluateGolden({
  rules: bundledRegistry(),
  calculatedAt: Instant.parse("2026-10-22T00:00:00Z"),
});

interface CoverageTotals {
  total: Record<
    "lines" | "branches" | "functions" | "statements",
    { pct: number; covered: number; total: number }
  >;
}
const engineSrc = path.join(REPO_ROOT, "packages", "calculation-engine", "src");
const coverageFile = path.join(
  REPO_ROOT,
  "packages",
  "calculation-engine",
  "coverage",
  "coverage-summary.json",
);
const newestSourceMs = Math.max(
  ...readdirSync(engineSrc).map((f) => statSync(path.join(engineSrc, f)).mtimeMs),
);
/** Coverage is only reported if it was produced after the last change to the engine source. */
const coverageState: "CURRENT" | "STALE" | "MISSING" = !existsSync(coverageFile)
  ? "MISSING"
  : statSync(coverageFile).mtimeMs < newestSourceMs
    ? "STALE"
    : "CURRENT";
const coverage =
  coverageState === "CURRENT"
    ? (JSON.parse(readFileSync(coverageFile, "utf8")) as CoverageTotals).total
    : null;

const results = {
  goldenScenarios: {
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    passRatePercent: (summary.passed / summary.total) * 100,
    reference: summary.reference,
    correctlyRejectedUnsupportedOrReview: summary.rejection,
    humanReviewed: summary.humanReviewed,
  },
  calculationEngineCoverage: {
    state: coverageState,
    lines: coverage?.lines ?? null,
    branches: coverage?.branches ?? null,
    source: path.relative(REPO_ROOT, coverageFile),
  },
  regressionFailures: summary.results
    .filter((r) => !r.passed)
    .map((r) => ({ id: r.id, mismatches: r.mismatches })),
  scenarios: summary.results,
};

const rows = summary.results
  .map(
    (r) =>
      `| ${r.id} | ${r.kind} | ${r.title} | ${r.expected.status} | ${r.actual.status} | ${r.actual.totalAmount} | ${r.passed ? "PASS" : "FAIL"} | ${r.humanReview} |`,
  )
  .join("\n");

const markdown = `# Benchmark D: correctness evaluation

${environmentMarkdown(environment)}

Engine ${ENGINE_VERSION}, rule set ${RULE_SET_IN_FORCE}.

| Measure | Result |
| --- | --- |
| Golden scenarios passed | ${summary.passed} / ${summary.total} (${results.goldenScenarios.passRatePercent.toFixed(1)}%) |
| Reference calculations matching hand-derived Schedule B values | ${summary.reference.passed} / ${summary.reference.total} |
| Unsupported / review-required cases correctly refused | ${summary.rejection.passed} / ${summary.rejection.total} |
| Scenarios reviewed by a qualified human | ${summary.humanReviewed} |
| Engine line coverage | ${coverage === null ? `NOT_AVAILABLE (coverage ${coverageState}; run pnpm test:coverage first)` : `${coverage.lines.pct}% (${coverage.lines.covered}/${coverage.lines.total})`} |
| Engine branch coverage | ${coverage === null ? `NOT_AVAILABLE (coverage ${coverageState})` : `${coverage.branches.pct}% (${coverage.branches.covered}/${coverage.branches.total})`} |

| ID | Kind | Scenario | Expected status | Actual status | Actual total | Result | Human review |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

**Interpretation limits.** Expected values were derived by hand from the award's published Schedule B rates. They have not been reviewed by a qualified payroll or legal professional or cross-checked with the Fair Work Pay Calculator. A pass rate on this small, supported scenario set is not a measure of legal accuracy across Australian payroll rules, and coverage is not evidence of legal correctness.
`;

const saved = saveRecord(
  {
    benchmark: "D-correctness",
    status: "COMPLETED",
    reason: null,
    environment,
    configuration: { engineVersion: ENGINE_VERSION, ruleSet: RULE_SET_IN_FORCE },
    results,
    errorCount: summary.failed,
    exitStatus: summary.failed === 0 ? 0 : 1,
  },
  markdown,
);
console.log(markdown);
console.log(`Saved ${saved.json}`);
process.exitCode = summary.failed === 0 ? 0 : 1;
