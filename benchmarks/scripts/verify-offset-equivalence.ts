/**
 * Equivalence check for the offset-table optimisation (Benchmark F).
 *
 * Calculates the full 10,000-shift benchmark workload twice in separate passes:
 *  1. with the cached OffsetTable (current code);
 *  2. with OffsetTable#offsetAt patched to call the underlying Intl-backed lookup on every call,
 *     which reproduces the pre-optimisation offset behaviour.
 * The SHA-256 digests of all results must be identical.
 */
import { createHash } from "node:crypto";

import { bundledRegistry } from "@wageguard/award-rules";
import { calculatePayPeriod } from "@wageguard/calculation-engine";
import { Instant } from "@wageguard/domain";
import { countShifts, generateWorkload } from "@wageguard/test-fixtures";

import { OffsetTable } from "../../packages/domain/src/time/offset-table.js";
import { captureEnvironment } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";

const context = { rules: bundledRegistry(), calculatedAt: Instant.parse("2026-10-22T00:00:00Z") };
const workload = generateWorkload(20_260_706, 10_000);

const digest = (): string => {
  const hash = createHash("sha256");
  for (const period of workload) {
    hash.update(JSON.stringify(calculatePayPeriod(period, context)));
  }
  return hash.digest("hex");
};

const optimised = digest();
const prototype = OffsetTable.prototype as unknown as {
  offsetAt: (ms: number) => number;
  lookup: (ms: number) => number;
};
prototype.offsetAt = function direct(this: { lookup: (ms: number) => number }, ms: number): number {
  return this.lookup(ms);
};
const direct = digest();

const identical = optimised === direct;
const environment = captureEnvironment("equivalence");
const markdown = `# Benchmark F (supporting): output equivalence of the offset-table optimisation

${environmentMarkdown(environment)}

| Pass | SHA-256 of all ${workload.length} results (${countShifts(workload)} shifts) |
| --- | --- |
| Cached offset table | \`${optimised}\` |
| Direct Intl-backed lookups (pre-optimisation behaviour) | \`${direct}\` |

**Result: ${identical ? "IDENTICAL" : "DIFFERENT"}**
`;
saveRecord(
  {
    benchmark: "F-offset-table-equivalence",
    status: "COMPLETED",
    reason: null,
    environment,
    configuration: { seed: 20_260_706, shifts: countShifts(workload), payPeriods: workload.length },
    results: { optimisedSha256: optimised, directSha256: direct, identical },
    errorCount: identical ? 0 : 1,
    exitStatus: identical ? 0 : 1,
  },
  markdown,
);
console.log(markdown);
process.exitCode = identical ? 0 : 1;
