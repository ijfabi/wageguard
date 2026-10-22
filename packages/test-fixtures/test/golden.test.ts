import { bundledRegistry } from "@wageguard/award-rules";
import { Instant } from "@wageguard/domain";
import { describe, expect, it } from "vitest";

import { GOLDEN_SCENARIOS, countShifts, evaluateGolden, generateWorkload } from "../src/index.js";

const context = { rules: bundledRegistry(), calculatedAt: Instant.parse("2026-10-22T00:00:00Z") };

describe("golden correctness scenarios", () => {
  const summary = evaluateGolden(context);

  it.each(summary.results.map((r) => [r.id, r] as const))("%s passes", (_id, result) => {
    expect(result.mismatches).toEqual([]);
  });

  it("has unique ids and every reference case states its derivation", () => {
    expect(new Set(GOLDEN_SCENARIOS.map((s) => s.id)).size).toBe(GOLDEN_SCENARIOS.length);
    expect(GOLDEN_SCENARIOS.filter((s) => s.kind === "REFERENCE").every((s) => /\$/.test(s.derivation))).toBe(
      true,
    );
  });

  it("does not claim human review that has not happened", () => {
    expect(summary.humanReviewed).toBe(0);
  });

  it("detects a wrong expectation (the evaluator is not vacuous)", () => {
    const [first] = GOLDEN_SCENARIOS;
    const broken = { ...first!, expected: { ...first!.expected, totalAmount: "260.71" } };
    const result = evaluateGolden(context, [broken]);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.mismatches[0]).toMatch(/total: expected 260.71, got 260.70/);
  });
});

describe("benchmark workload generator", () => {
  it("is deterministic for a seed and produces the requested shift count", () => {
    const a = generateWorkload(42, 1000);
    expect(countShifts(a)).toBe(1000);
    expect(JSON.stringify(generateWorkload(42, 1000))).toBe(JSON.stringify(a));
    expect(JSON.stringify(generateWorkload(43, 1000))).not.toBe(JSON.stringify(a));
  });

  it("produces only valid engine input", async () => {
    const { calculatePayPeriod } = await import("@wageguard/calculation-engine");
    for (const period of generateWorkload(7, 250)) {
      expect(() => calculatePayPeriod(period, context)).not.toThrow();
    }
  });
});
