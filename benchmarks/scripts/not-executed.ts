/**
 * Records an explicit NOT_EXECUTED result for benchmarks whose infrastructure does not exist yet,
 * so that reports never show an empty slot that could be mistaken for a measurement.
 * Replace with the real benchmark script once the prerequisite exists.
 */
import { captureEnvironment } from "../lib/environment.js";
import { environmentMarkdown, saveRecord } from "../lib/results.js";

const PENDING: Readonly<Record<string, { title: string; reason: string }>> = {
  api: {
    title: "Benchmark B: audit API performance (k6)",
    reason:
      "The REST API (Phase 2) has not been implemented yet, and the Docker daemon was not running on the benchmark machine.",
  },
  database: {
    title: "Benchmark C: database query performance",
    reason:
      "The PostgreSQL persistence layer (Phase 2) has not been implemented yet, and the Docker daemon was not running on the benchmark machine.",
  },
  reliability: {
    title: "Benchmark E: reliability and recovery",
    reason: "The audit-processing workflow and job queue (Phases 2 and 4) have not been implemented yet.",
  },
};

const kind = process.argv[2] ?? "";
const pending = PENDING[kind];
if (pending === undefined) {
  throw new Error(`Unknown benchmark "${kind}". Expected one of: ${Object.keys(PENDING).join(", ")}`);
}
const environment = captureEnvironment(kind);
const markdown = `# ${pending.title}

**Status: NOT_EXECUTED**

${pending.reason}

${environmentMarkdown(environment)}
`;
const saved = saveRecord(
  {
    benchmark: pending.title,
    status: "NOT_EXECUTED",
    reason: pending.reason,
    environment,
    configuration: {},
    results: null,
    errorCount: 0,
    exitStatus: 0,
  },
  markdown,
);
console.log(markdown);
console.log(`Saved ${saved.json}`);
