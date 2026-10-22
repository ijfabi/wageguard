# Benchmark summary

Generated from 14 raw result file(s) in `benchmarks/results/`. Every number below is copied from a saved record.

## Status

| ID  | Benchmark                     | Status       | Latest run / reason                                                                                                                      | Evidence                                                              |
| --- | ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A   | Calculation engine throughput | COMPLETED    | 2026-10-22T12:01:59.466Z                                                                                                                 | `benchmarks/results/engine-2026-10-22T12-01-59-466Z-3bf2ea.json`      |
| B   | Audit API performance         | NOT_EXECUTED | The REST API (Phase 2) has not been implemented yet, and the Docker daemon was not running on the benchmark machine.                     | `benchmarks/results/api-2026-10-22T11-40-09-872Z-b6ab43.json`         |
| C   | Database query performance    | NOT_EXECUTED | The PostgreSQL persistence layer (Phase 2) has not been implemented yet, and the Docker daemon was not running on the benchmark machine. | `benchmarks/results/database-2026-10-22T11-40-10-624Z-f63254.json`    |
| D   | Correctness evaluation        | COMPLETED    | 2026-10-22T12:01:43.607Z                                                                                                                 | `benchmarks/results/correctness-2026-10-22T12-01-43-607Z-4b134d.json` |
| E   | Reliability and recovery      | NOT_EXECUTED | The audit-processing workflow and job queue (Phases 2 and 4) have not been implemented yet.                                              | `benchmarks/results/reliability-2026-10-22T11-40-11-419Z-b784e9.json` |

## A: Calculation engine throughput (latest optimised run)

| Shifts | Shifts/s (median) | Total ms (median) | Total ms (p95 of repetitions) | Per pay period ms (p95) | Peak RSS MiB |
| ------ | ----------------- | ----------------- | ----------------------------- | ----------------------- | ------------ |
| 100    | 16209             | 6.01              | 6.78                          | 0.859                   | 85.7         |
| 1000   | 22508             | 42.93             | 50.14                         | 0.742                   | 103.3        |
| 10000  | 32588             | 306.71            | 366.42                        | 0.544                   | 145.7        |

## F: Baseline comparison (offset-table optimisation)

Baseline: `benchmarks/results/engine-2026-10-22T11-33-22-878Z-91c72e.json` (source tree `3502f394aaea`)
Optimised: `benchmarks/results/engine-2026-10-22T12-01-59-466Z-3bf2ea.json` (source tree `d70e7d3a3a38`, label `optimised-offset-table`)

Comparable environment and workload: **yes**

| Shifts | Median total ms (baseline -> optimised) | Improvement | Median shifts/s (baseline -> optimised) | Throughput increase | p95 per-period ms (baseline -> optimised) | Improvement |
| ------ | --------------------------------------- | ----------- | --------------------------------------- | ------------------- | ----------------------------------------- | ----------- |
| 100    | 28.67 -> 6.01                           | 79%         | 3480 -> 16209                           | +365.7%             | 3.66 -> 0.859                             | 76.5%       |
| 1000   | 226.7 -> 42.93                          | 81.1%       | 4241 -> 22508                           | +430.8%             | 3.021 -> 0.742                            | 75.4%       |
| 10000  | 2088.03 -> 306.71                       | 85.3%       | 4763 -> 32588                           | +584.1%             | 3.985 -> 0.544                            | 86.4%       |

Output equivalence: identical result digests with and without the optimisation (`benchmarks/results/equivalence-2026-10-22T11-40-08-075Z-5716ab.json`).

Formulas: improvement % = (baseline - improved) / baseline x 100 (time, latency); throughput increase % = (improved - baseline) / baseline x 100.

## Limits

All measurements are synthetic, from a single developer workstation, and describe the isolated calculation engine unless stated otherwise. They are not production observations and do not predict deployed capacity.
