# ADR 0007: Memoise time-zone offsets as per-year transition tables

- Status: Accepted
- Date: 2026-10-22

## Context

The first engine benchmark measured about 4,763 synthetic shifts per second. A V8 CPU profile showed where the time went:

- Luxon's `IANAZone.offset`, which calls `Intl.DateTimeFormat#formatToParts` on every lookup, took **66% of CPU time inclusive**. Each wall-clock conversion made three to four such calls.
- `IANAZone.isValidZone` took another 4.5%, because it builds a new `Intl` formatter for every calculation.

## Decision

**Offset table**

- `OffsetTable` builds one transition table per UTC year: it probes once per day and binary-searches each offset change to the millisecond.
- Every later lookup is a short array scan with no `Intl` call.
- It caches time-zone rule data only, never calculation inputs, so repeated benchmark runs gain nothing from data reuse.

**Zone cache**

- `TimeZone.of` caches validated zone instances by id.

**Correctness**

- The tables assume a zone changes offset at most once in any 24 hours.
- A property test compares the table with the direct lookup at 5,000 random instants from 1900 to 2100 across 8 zones, including Lord Howe's 30-minute DST and Chatham's +12:45.
- A ±1 ms check runs at real Sydney transitions.

**Output equivalence**

- The full 10,000-shift benchmark workload produces identical SHA-256 result digests with the table and with patched direct lookups (`pnpm benchmark:equivalence`).

## Consequences

Measured on the same machine, workload and repetitions (`benchmarks/reports/summary.md`):

| Measure at 10,000 shifts | Baseline       | Optimised       | Change       |
| ------------------------ | -------------- | --------------- | ------------ |
| Median total time        | 2,088 ms       | 289 ms          | 86.1% faster |
| Median throughput        | 4,763 shifts/s | 34,453 shifts/s | +623%        |

Memory cost is a few small arrays per zone per year touched.
