# ADR 0007: Cache time-zone offsets as yearly transition tables

- Status: Accepted
- Date: 2026-10-22

## Context

The first engine benchmark managed about 4,763 shifts per second. A V8 CPU profile showed where the time went. Luxon's `IANAZone.offset`, which calls `Intl.DateTimeFormat#formatToParts` every time it's asked for an offset, accounted for 66% of all CPU time, and each clock-time conversion made three or four of those calls. Another 4.5% went on `IANAZone.isValidZone`, which built a new `Intl` formatter for every calculation.

## Decision

`OffsetTable` builds one table of offset changes for each UTC year. It samples once a day and then narrows each change down to the exact millisecond with a binary search. After that, looking up an offset is a short scan of a small array with no `Intl` call at all. The table only caches facts about the time zone, never anything about the calculation, so repeated benchmark runs can't get faster by reusing results. `TimeZone.of` also caches validated zones by name.

The tables assume a zone never changes its offset more than once in 24 hours, which holds for every real zone. A property test compares the table with a direct lookup at 5,000 random moments between 1900 and 2100 across 8 zones. Those include Lord Howe Island, whose daylight saving moves the clock by 30 minutes, and the Chatham Islands at +12:45. A further test checks real Sydney transitions to within a millisecond.

The output had to be exactly the same as before. The full 10,000-shift benchmark workload produces identical SHA-256 digests of its results with the tables and with direct lookups (`pnpm benchmark:equivalence`).

## Consequences

On the same machine, with the same workload and repetitions:

| At 10,000 shifts  | Before         | After           | Change       |
| ----------------- | -------------- | --------------- | ------------ |
| Median total time | 2,088 ms       | 307 ms          | 85.3% faster |
| Median throughput | 4,763 shifts/s | 32,588 shifts/s | +584%        |

Those figures are the latest run tied to a commit (`4b05512`). Optimised runs on this machine ranged from 32,358 to 34,453 shifts per second, apart from one outlier taken while the machine was busy. [Performance](../performance.md) has every run.

The memory cost is a few small arrays for each zone and year actually used.
