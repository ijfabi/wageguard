# Benchmark summary

Generated from 10 raw result file(s) in `benchmarks/results/`. Every number below is copied from a saved record.

## Status

| ID  | Benchmark                     | Status       | Latest run / reason                                                                                                                      | Evidence                                                              |
| --- | ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A   | Calculation engine throughput | COMPLETED    | 2026-10-22T11:36:31.294Z                                                                                                                 | `benchmarks/results/engine-2026-10-22T11-36-31-294Z-97268c.json`      |
| B   | Audit API performance         | NOT_EXECUTED | The REST API (Phase 2) has not been implemented yet, and the Docker daemon was not running on the benchmark machine.                     | `benchmarks/results/api-2026-10-22T11-40-09-872Z-b6ab43.json`         |
| C   | Database query performance    | NOT_EXECUTED | The PostgreSQL persistence layer (Phase 2) has not been implemented yet, and the Docker daemon was not running on the benchmark machine. | `benchmarks/results/database-2026-10-22T11-40-10-624Z-f63254.json`    |
| D   | Correctness evaluation        | COMPLETED    | 2026-10-22T11:40:08.998Z                                                                                                                 | `benchmarks/results/correctness-2026-10-22T11-40-08-998Z-c849be.json` |
| E   | Reliability and recovery      | NOT_EXECUTED | The audit-processing workflow and job queue (Phases 2 and 4) have not been implemented yet.                                              | `benchmarks/results/reliability-2026-10-22T11-40-11-419Z-b784e9.json` |

## A: Calculation engine throughput (latest optimised run)

| Shifts | Shifts/s (median) | Total ms (median) | Total ms (p95 of repetitions) | Per pay period ms (p95) | Peak RSS MiB |
| ------ | ----------------- | ----------------- | ----------------------------- | ----------------------- | ------------ |
| 100    | 20439             | 4.88              | 6.09                          | 0.766                   | 85.5         |
| 1000   | 24079             | 41.41             | 43.49                         | 0.617                   | 103.1        |
| 10000  | 34453             | 289.43            | 359.66                        | 0.474                   | 145.7        |

## F: Baseline comparison (offset-table optimisation)

Baseline: `benchmarks/results/engine-2026-10-22T11-33-22-878Z-91c72e.json` (source tree `3502f394aaea`)
Optimised: `benchmarks/results/engine-2026-10-22T11-36-31-294Z-97268c.json` (source tree `cc6b355e7eab`, label `optimised-offset-table`)

Comparable environment and workload: **yes**

| Shifts | Median total ms (baseline -> optimised) | Improvement | Median shifts/s (baseline -> optimised) | Throughput increase | p95 per-period ms (baseline -> optimised) | Improvement |
| ------ | --------------------------------------- | ----------- | --------------------------------------- | ------------------- | ----------------------------------------- | ----------- |
| 100    | 28.67 -> 4.88                           | 83%         | 3480 -> 20439                           | +487.3%             | 3.66 -> 0.766                             | 79.1%       |
| 1000   | 226.7 -> 41.41                          | 81.7%       | 4241 -> 24079                           | +467.8%             | 3.021 -> 0.617                            | 79.6%       |
| 10000  | 2088.03 -> 289.43                       | 86.1%       | 4763 -> 34453                           | +623.3%             | 3.985 -> 0.474                            | 88.1%       |

Output equivalence: identical result digests with and without the optimisation (`benchmarks/results/equivalence-2026-10-22T11-40-08-075Z-5716ab.json`).

Formulas: improvement % = (baseline - improved) / baseline x 100 (time, latency); throughput increase % = (improved - baseline) / baseline x 100.

## Limits

All measurements are synthetic, from a single developer workstation, and describe the isolated calculation engine unless stated otherwise. They are not production observations and do not predict deployed capacity.
