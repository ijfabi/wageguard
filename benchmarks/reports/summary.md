# Benchmark summary

Generated from 25 raw result file(s) in `benchmarks/results/`. Every number below is copied from a saved record.

## Status

| ID  | Benchmark                     | Status    | Latest run / reason      | Evidence                                                              |
| --- | ----------------------------- | --------- | ------------------------ | --------------------------------------------------------------------- |
| A   | Calculation engine throughput | COMPLETED | 2026-10-25T08:07:09.335Z | `benchmarks/results/engine-2026-10-25T08-07-09-335Z-c2b456.json`      |
| B   | Audit API performance         | COMPLETED | 2026-10-24T15:23:43.912Z | `benchmarks/results/api-2026-10-24T15-23-43-912Z-8815c8.json`         |
| C   | Database query performance    | COMPLETED | 2026-10-24T15:15:53.196Z | `benchmarks/results/database-2026-10-24T15-15-53-196Z-48304d.json`    |
| D   | Correctness evaluation        | COMPLETED | 2026-10-25T08:06:37.309Z | `benchmarks/results/correctness-2026-10-25T08-06-37-309Z-80d3ee.json` |
| E   | Reliability and recovery      | COMPLETED | 2026-10-24T15:49:32.351Z | `benchmarks/results/reliability-2026-10-24T15-49-32-351Z-b942b0.json` |

## A: Calculation engine throughput (latest optimised run)

| Shifts | Shifts/s (median) | Total ms (median) | Total ms (p95 of repetitions) | Per pay period ms (p95) | Peak RSS MiB |
| ------ | ----------------- | ----------------- | ----------------------------- | ----------------------- | ------------ |
| 100    | 11925             | 8.28              | 10.02                         | 1.209                   | 87.9         |
| 1000   | 16593             | 59.98             | 65.74                         | 0.955                   | 108.1        |
| 10000  | 20266             | 470.71            | 604.03                        | 1.011                   | 150.9        |

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

## B: Audit API (k6, closed model, production image)

Baseline: `benchmarks/results/api-2026-10-24T15-12-10-314Z-1557ba.json`. Optimised: `benchmarks/results/api-2026-10-24T15-23-43-912Z-8815c8.json`. Same workload: **yes**.

| Clients | Throughput req/s (baseline -> optimised) | Change | p95 ms         | Change | p99 ms         | Error rate (worst) |
| ------- | ---------------------------------------- | ------ | -------------- | ------ | -------------- | ------------------ |
| 1       | 184.2 -> 234.7                           | +27.4% | 10.7 -> 11.8   | +9.8%  | 13.8 -> 18     | 0%                 |
| 10      | 340.5 -> 483.3                           | +41.9% | 74.3 -> 56.7   | -23.6% | 101.8 -> 69.5  | 0%                 |
| 25      | 315.6 -> 470.9                           | +49.2% | 214.6 -> 155.4 | -27.6% | 269.8 -> 176.1 | 0%                 |
| 50      | 307 -> 475.4                             | +54.9% | 442.6 -> 311.6 | -29.6% | 516.6 -> 342.6 | 0%                 |

## C: Database queries (baseline -> optimised)

Baseline: `benchmarks/results/database-2026-10-23T09-30-02-065Z-ca0e4e.json`. Optimised: `benchmarks/results/database-2026-10-24T15-15-53-196Z-48304d.json`. Largest step: 10,000 audits for the measured user, 50,000 in total.

| Operation                                    | Median ms (baseline -> optimised) | Change | SQL statements | Sequential scans (baseline -> optimised) |
| -------------------------------------------- | --------------------------------- | ------ | -------------- | ---------------------------------------- |
| Audit history, first page (20)               | 6.06 -> 1.36                      | -77.6% | 1 -> 1         | none -> none                             |
| Audit history, page at the midpoint (keyset) | 8.74 -> 3.11                      | -64.5% | 1 -> 1         | none -> none                             |
| Audit history filtered by status             | 6.45 -> 1.56                      | -75.8% | 1 -> 1         | none -> none                             |
| Audit detail with findings                   | 2.35 -> 2.48                      | +5.5%  | 2 -> 1         | none -> none                             |
| Dashboard summary                            | 23.53 -> 8.86                     | -62.3% | 5 -> 5         | audits -> none                           |
| Payslip history, first page (20)             | 3.88 -> 1.72                      | -55.6% | 2 -> 2         | payslips, payslip_lines -> payslip_lines |
| Shift list for an employment (20)            | 2.28 -> 2.9                       | +27%   | 2 -> 2         | none -> none                             |
| Shift CSV import (14 rows with meal breaks)  | 71.72 -> 15.45                    | -78.5% | 60 -> 6        | none -> none                             |

## E: Reliability and recovery

Latest: `benchmarks/results/reliability-2026-10-24T15-49-32-351Z-b942b0.json`.

| Scenario                                          | Logical submissions | Completed | Longest stretch with no completions | Resumed after the fault ended | Attempt outcomes             |
| ------------------------------------------------- | ------------------- | --------- | ----------------------------------- | ----------------------------- | ---------------------------- |
| API process killed (SIGKILL), restarted by Docker | 7445                | 7445      | 1.95 s                              | 0.61 s                        | 201: 7445, network error: 30 |
| Database stopped for 10 s                         | 7554                | 7554      | 11.54 s                             | 1.35 s                        | 201: 7554, 503: 30           |

Duplicates: 20 sequential and 50 concurrent requests with one key stored 1 and 1 audit(s). Integrity failures across both fault scenarios (duplicates, acknowledged but missing, orphaned or mismatched findings): 0.

## Limits

All measurements are synthetic and come from a single developer workstation; for B and E the load generator, API and database share that machine. A and F describe the isolated calculation engine. None of this is a production observation or a prediction of deployed capacity.
