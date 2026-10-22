import { calculatePayPeriod, isBlocking, type CalculationContext } from "@wageguard/calculation-engine";

import { GOLDEN_SCENARIOS, type GoldenKind, type GoldenScenario } from "./scenarios.js";

export interface GoldenResult {
  readonly id: string;
  readonly kind: GoldenKind;
  readonly title: string;
  readonly passed: boolean;
  readonly mismatches: readonly string[];
  readonly expected: GoldenScenario["expected"];
  readonly actual: {
    readonly status: string;
    readonly totalAmount: string;
    readonly lines: Readonly<Record<string, string>>;
    readonly blockingIssueCodes: readonly string[];
  };
  readonly derivation: string;
  readonly sources: readonly string[];
  readonly humanReview: string;
}

export interface GoldenSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly reference: { readonly total: number; readonly passed: number };
  /** Unsupported / review-required cases that were correctly refused rather than calculated. */
  readonly rejection: { readonly total: number; readonly passed: number };
  readonly humanReviewed: number;
  readonly results: readonly GoldenResult[];
}

/**
 * Runs every golden scenario through the engine and compares status, total, per-rule lines and
 * blocking issue codes with the hand-derived expectations.
 */
export function evaluateGolden(
  context: CalculationContext,
  scenarios: readonly GoldenScenario[] = GOLDEN_SCENARIOS,
): GoldenSummary {
  const results = scenarios.map((scenario) => evaluateOne(scenario, context));
  const count = (kind: GoldenKind, onlyPassed: boolean): number =>
    results.filter((r) => r.kind === kind && (!onlyPassed || r.passed)).length;
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    reference: { total: count("REFERENCE", false), passed: count("REFERENCE", true) },
    rejection: { total: count("REJECTION", false), passed: count("REJECTION", true) },
    humanReviewed: scenarios.filter((s) => s.verification.humanReview === "REVIEWED").length,
    results,
  };
}

function evaluateOne(scenario: GoldenScenario, context: CalculationContext): GoldenResult {
  const result = calculatePayPeriod(scenario.input, context);
  const actual = {
    status: result.status,
    totalAmount: result.totals.amount,
    lines: Object.fromEntries(result.lines.map((l) => [l.ruleId, l.amount])),
    blockingIssueCodes: [...new Set(result.issues.filter(isBlocking).map((i) => i.code))].sort(),
  };
  const { expected } = scenario;
  const mismatches: string[] = [];
  if (actual.status !== expected.status) {
    mismatches.push(`status: expected ${expected.status}, got ${actual.status}`);
  }
  if (result.metadata.ruleSetVersion !== null && result.metadata.ruleSetVersion !== scenario.ruleSetVersion) {
    mismatches.push(`rule set: expected ${scenario.ruleSetVersion}, got ${result.metadata.ruleSetVersion}`);
  }
  if (expected.totalAmount !== undefined && actual.totalAmount !== expected.totalAmount) {
    mismatches.push(`total: expected ${expected.totalAmount}, got ${actual.totalAmount}`);
  }
  if (
    expected.lines !== undefined &&
    JSON.stringify(sortKeys(actual.lines)) !== JSON.stringify(sortKeys(expected.lines))
  ) {
    mismatches.push(`lines: expected ${JSON.stringify(expected.lines)}, got ${JSON.stringify(actual.lines)}`);
  }
  if (expected.issueCodes !== undefined) {
    const wanted = [...expected.issueCodes].sort();
    if (JSON.stringify(wanted) !== JSON.stringify(actual.blockingIssueCodes)) {
      mismatches.push(`issues: expected ${wanted.join(",")}, got ${actual.blockingIssueCodes.join(",")}`);
    }
  }
  return {
    id: scenario.id,
    kind: scenario.kind,
    title: scenario.title,
    passed: mismatches.length === 0,
    mismatches,
    expected,
    actual,
    derivation: scenario.derivation,
    sources: scenario.sources,
    humanReview: scenario.verification.humanReview,
  };
}

function sortKeys(record: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}
