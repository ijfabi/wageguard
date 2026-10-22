# Performance and benchmarking

All numbers come from saved records in `benchmarks/results/`. `benchmarks/reports/summary.md` is regenerated from those records by `pnpm benchmark:report`.

## Status

| Benchmark              | Status       | Notes                                                                    |
| ---------------------- | ------------ | ------------------------------------------------------------------------ |
| A: Engine throughput   | Executed     | 100 / 1,000 / 10,000 shifts, 3 warm-up + 10 measured repetitions         |
| B: Audit API (k6)      | NOT_EXECUTED | API not implemented yet; Docker daemon was not running                   |
| C: Database queries    | NOT_EXECUTED | Persistence not implemented yet                                          |
| D: Correctness         | Executed     | 21/21 golden scenarios; engine coverage read from a current coverage run |
| E: Reliability         | NOT_EXECUTED | Job workflow not implemented yet                                         |
| F: Baseline comparison | Executed     | Offset-table optimisation, with output equivalence verified              |

## Benchmark A methodology

- **Workload.** `generateWorkload(seed 20260706, n)`, generator v1. It produces fortnightly pay periods of 10 shifts, alternating casual and part-time. Shifts start between 07:00 and 15:00 and last 3 to 8 hours, with a 30-minute meal break when longer than 5 hours. About 85% of periods end up `REVIEW_REQUIRED`, mostly because work runs past the span of hours. That is realistic for evening retail work, and every path is exercised.
- **Execution.** Single Node.js process. The workload is generated before timing. Each size gets 3 warm-up repetitions, then 10 measured repetitions, each preceded by a forced GC (`--expose-gc`). Per-pay-period latency is recorded on the first measured repetition.
- **Recorded fields.** Run id, UTC time, git SHA (or the source-tree SHA-256 when git is unavailable), OS, CPU, memory, Node version, Docker version, seed, sizes, repetitions, raw repetition totals, distributions (mean, median, p95, p99, stddev), CPU time, heap delta, peak RSS, status mix, errors, and an output digest.
- **Scope.** The isolated engine only, excluding HTTP, request parsing and database access. **Not** end-to-end API throughput.

## Benchmark F: offset-table optimisation

Baseline: `benchmarks/results/engine-2026-10-22T11-33-22-878Z-91c72e.json`. Optimised: `benchmarks/results/engine-2026-10-22T11-36-31-294Z-97268c.json`. Same machine (i7-13650HX, Windows 11, Node 24.22.1), same seed, sizes and repetitions.

| Shifts | Median total (ms) | Improvement | Median shifts/s | Throughput increase | p95 per period (ms) | Improvement |
| ------ | ----------------- | ----------- | --------------- | ------------------- | ------------------- | ----------- |
| 100    | 28.67 → 4.88      | 83.0%       | 3,480 → 20,439  | +487.3%             | 3.66 → 0.766        | 79.1%       |
| 1,000  | 226.70 → 41.41    | 81.7%       | 4,241 → 24,079  | +467.8%             | 3.021 → 0.617       | 79.6%       |
| 10,000 | 2,088.03 → 289.43 | 86.1%       | 4,763 → 34,453  | +623.3%             | 3.985 → 0.474       | 88.1%       |

- **Formulas.** Improvement % = (baseline − improved) / baseline × 100. Throughput increase % = (improved − baseline) / baseline × 100.
- **Equivalence.** The 10,000-shift result digest `47091c25…` was identical with and without the optimisation (`benchmarks/results/equivalence-*.json`).
- **Repeatability.** A second optimised run gave 34,108 shifts/s at 10,000 shifts, within 1% of the first.

## Caveats

- **Single machine.** One developer laptop, not an isolated benchmark host. Background load was not controlled.
- **Sequential runs.** The baseline and optimised runs were a few minutes apart. The baseline could not be re-run afterwards because the pre-optimisation code is identified only by its source-tree hash (no git on the machine). This will be fixed once the repository is under git.
- **CPU % granularity.** On Windows, `process.cpuUsage` has roughly 15 ms granularity, so CPU% for the 100-shift size (about 5 ms runs) is not meaningful. Values above 100% reflect GC and JIT threads.
- **Not in CI.** Benchmarks are not CI gates until their noise on shared runners has been characterised.

## Commands

```bash
BENCHMARK_LABEL=<label> pnpm benchmark:engine   # A ("baseline" / "optimised-*" labels drive F)
pnpm benchmark:equivalence                      # F output-equivalence record
pnpm benchmark:correctness                      # D (run pnpm test:coverage first)
pnpm benchmark:api | benchmark:database | benchmark:reliability   # currently record NOT_EXECUTED
pnpm benchmark:report                           # regenerate reports/summary.md
pnpm resume:metrics                             # regenerate docs/resume-evidence/*
```
