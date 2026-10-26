# Performance and benchmarking

Every number on this page comes from a saved record in `benchmarks/results/`. `pnpm benchmark:report` rebuilds `benchmarks/reports/summary.md` from those records, and `pnpm resume:metrics` builds the resume evidence from the same files, so a figure can always be traced back to the run that produced it.

All of it was measured on one laptop: Intel i7-13650HX (20 logical cores), 16 GB of RAM, Windows 11, Node 24.22.1, Docker Desktop. That machine is also used for other things, so each record from Phase 5 includes a one-second CPU sample taken just before the run. The data is synthetic throughout.

| Benchmark | What it measures                                      | Status                                   |
| --------- | ----------------------------------------------------- | ---------------------------------------- |
| A         | Calculation engine throughput                         | Done                                     |
| B         | The audit API under load (k6)                         | Done, before and after the Phase 5 fixes |
| C         | Database queries                                      | Done, before and after the Phase 5 fixes |
| D         | Correctness against golden scenarios                  | Done: 29 of 29 (rule set r2)             |
| E         | Reliability under injected failures                   | Done                                     |
| F         | Engine before and after the offset-table optimisation | Done                                     |

## A and F: the calculation engine

The workload is `generateWorkload(seed 20260706, n)`, generator version 1. It makes fortnightly pay periods of 10 shifts, alternating casual and part-time, starting between 07:00 and 15:00 and lasting 3 to 8 hours, with a 30-minute meal break on shifts over 5 hours. About 85% of the periods come out as "needs review", mostly because the shift runs past the span of ordinary hours. That's typical of evening retail work, and it makes sure every code path gets exercised.

Each size runs 3 warm-up repetitions and then 10 measured ones in a single Node process, with a forced garbage collection before each. This measures the engine on its own, with no HTTP, parsing or database involved.

Profiling showed that most of the time went on time-zone offset lookups. Replacing them with per-year transition tables ([ADR 0007](adr/0007-offset-table-optimisation.md)) gave these results on the same machine, seed, sizes and repetitions:

| Shifts | Median total (ms) | Faster by | Median shifts/s | p95 per pay period (ms) |
| ------ | ----------------- | --------- | --------------- | ----------------------- |
| 100    | 28.67 → 6.01      | 79.0%     | 3,480 → 16,209  | 3.66 → 0.859            |
| 1,000  | 226.70 → 42.93    | 81.1%     | 4,241 → 22,508  | 3.021 → 0.742           |
| 10,000 | 2,088.03 → 306.71 | 85.3%     | 4,763 → 32,588  | 3.985 → 0.544           |

Output was identical with and without the change: the 10,000-shift result digest is `47091c25…` both ways (`benchmarks/results/equivalence-*.json`).

All runs are kept, outliers included. One optimised run came in at 12,651 shifts/s against roughly 32,000–34,000 for the others. It was the first run after Docker Desktop had started its virtual machine, and the spread between its repetitions was five times the usual, so it looks like machine load rather than a code change. Leaving it out, the optimised runs ranged from 32,358 to 34,453 shifts/s.

The baseline was recorded before the repository existed, so it's identified by a hash of the source tree (`3502f394…`) rather than a commit.

### Rule set r2

Rule set r2 prices what r1 only flagged: overtime, public holidays, minimum engagement, short breaks between work days, junior rates and the rest ([ADR 0016](adr/0016-rule-set-revisions.md)). That means more work per shift: a second classification pass for daily, guaranteed and weekly limits, and top-ups. With the same seed, sizes and repetitions at commit `f3d0dcc`, three runs gave these results for 10,000 shifts:

| Run | Median shifts/s | Median total (ms) | p95 total (ms) |
| --- | --------------- | ----------------- | -------------- |
| 1   | 15,530          | 622.91            | 736.13         |
| 2   | 19,515          | 484.20            | 586.90         |
| 3   | 20,266          | 470.71            | 604.03         |

That's roughly 40% fewer shifts a second than r1's 32,588, for work that is now fully priced: every synthetic pay period comes out as "calculated", where under r1 about 85% needed review. The output digests differ from r1's because the results differ, so Benchmark F's equivalence check doesn't apply across rule sets. Run 1 came first after a full build and shows a wider spread between repetitions; all three are kept.

## C: database queries

`pnpm build && pnpm benchmark:database` starts a fresh PostgreSQL 17.6 container, applies the real migrations, and boots the compiled API in-process. It then calls the same service methods the HTTP routes use, so every query is the one production sends. Every SQL statement is counted as it passes through the `pg` driver, and each distinct read is re-run under `EXPLAIN (ANALYZE, BUFFERS)` with its real parameters.

The data grows in three steps: 100, 1,000 and 10,000 audits for the user being measured, with four other users holding the same number each. At the top step that's 50,000 audits, 66,665 findings, 140,000 shifts and 50,000 payslips, about 513 MiB. Bulk rows are copies of real audits created through the API, so the JSON snapshots are realistic. They use random (v4) UUIDs instead of the app's time-ordered v7 ones, which affects index locality a little and nothing else.

The first run turned up four problems:

1. **The audit history page loaded every column,** including four large JSON snapshots per row that the page never shows. PostgreSQL ran the query in 0.12 ms, but the call took about 6 ms.
2. **The dashboard did two full scans of the audits table** to add up shift counts and underpayment amounts, because neither column was in an index. It slowed down as history grew: 3.4 ms, then 3.9 ms, then 23.5 ms.
3. **Payslip history had no index matching its filter and sort,** so it scanned and sorted the whole table.
4. **Importing 14 shifts from CSV sent 60 SQL statements,** four per row: insert and re-read the shift, and the same again for its break.

The fixes were to load only the columns each response needs, extend the existing audit index with the two summed columns so all five dashboard queries can be answered from the index, add a `(user_id, created_at DESC, id)` index on payslips, and insert all of an import's shifts and breaks in two statements. With the largest dataset:

| Operation                        | Median before → after | Change                   | SQL statements | Full-table scans |
| -------------------------------- | --------------------- | ------------------------ | -------------- | ---------------- |
| Audit history, first page        | 6.06 → 1.36 ms        | −77.6%                   | 1 → 1          | none             |
| Audit history, middle page       | 8.74 → 3.11 ms        | −64.5%                   | 1 → 1          | none             |
| Audit history filtered by status | 6.45 → 1.56 ms        | −75.8%                   | 1 → 1          | none             |
| Dashboard                        | 23.53 → 8.86 ms       | −62.3%                   | 5 → 5          | audits → none    |
| Payslip history                  | 3.88 → 1.72 ms        | −55.6%                   | 2 → 2          | payslips → none  |
| CSV import, 14 rows              | 71.72 → 15.45 ms      | −78.5%                   | 60 → 6         | none             |
| Audit detail                     | 2.35 → 2.48 ms        | no real change           | 2 → 1          | none             |
| Shift list                       | 2.28 → 2.90 ms        | not changed by this work | 2 → 2          | none             |

The last two rows are there for completeness. The detail view now needs one query instead of two, but at this size that doesn't show up in the timing. The shift list code wasn't touched, so its difference is run-to-run noise.

The dashboard still slows down as a user's history grows, because it adds up every audit they have. It now reads only the index, though, so the growth is much flatter. Records: baseline `database-2026-10-23T09-30-02-065Z-ca0e4e.json` (missing its commit hash because git wasn't on the PATH, but the source-tree hash identifies the code), optimised `database-2026-10-24T15-15-53-196Z-48304d.json`.

## B: the API under load

`pnpm benchmark:api` builds the production API image and starts it in its own Docker Compose project (`benchmarks/k6/docker-compose.yml`), alongside a throwaway PostgreSQL. The only setting changed from production is the rate limit, since every virtual user comes from the same IP address. k6 2.3.0 then runs inside the same Docker network.

Each virtual user is its own synthetic account with six shifts, a payslip and one audit. The model is closed: a fixed number of users, each sending the next request as soon as the last one returns, with no pause. So each level measures how much the server can handle at that concurrency. The levels are 1, 10, 25 and 50 users, each with a 10-second warm-up that's thrown away and then 60 seconds of measurement. Every user cycles through the same 20 requests, which works out to:

| Request                               | Share |
| ------------------------------------- | ----- |
| Dashboard                             | 30%   |
| Audit history                         | 25%   |
| Audit detail                          | 20%   |
| Audit lines                           | 10%   |
| New audit (full calculation and save) | 15%   |

Percentiles are worked out from every individual request (k6 exports the raw data points), using the same nearest-rank method as the other benchmarks. After each run, a database check confirms that every successful audit creation was saved exactly once.

| Clients | Requests/s before → after | Change | p95 before → after | p99 before → after |
| ------- | ------------------------- | ------ | ------------------ | ------------------ |
| 1       | 184.2 → 234.7             | +27.4% | 10.7 → 11.8 ms     | 13.8 → 18.0 ms     |
| 10      | 340.5 → 483.3             | +41.9% | 74.3 → 56.7 ms     | 101.8 → 69.5 ms    |
| 25      | 315.6 → 470.9             | +49.2% | 214.6 → 155.4 ms   | 269.8 → 176.1 ms   |
| 50      | 307.0 → 475.4             | +54.9% | 442.6 → 311.6 ms   | 516.6 → 342.6 ms   |

Both runs had a 0% error rate. Every one of the 12,214 and 17,622 successful audit creations was in the database afterwards, with no duplicates.

The API is a single Node.js process, so throughput levels off at about 10 clients and latency after that is mostly requests waiting their turn. The database fixes cut the CPU time each request needs, which is why throughput rose by more as concurrency went up. At a single client the tail latency got slightly worse (p95 10.7 → 11.8 ms). On a run this short, on a shared laptop, I'd treat that as noise. The optimised run also started with more background load on the machine (23% of CPU busy against 16%), which works against it rather than for it.

Records: `api-2026-10-24T15-12-10-314Z-1557ba.json` (before) and `api-2026-10-24T15-23-43-912Z-8815c8.json` (after), both at commit `73dc9a0` with the Phase 5 changes on top.

The first two attempts at this benchmark hung partway through. The cause turned out to be how k6 was launched: `docker compose run` attaches stdin by default, and when the orchestrating script passed its own stdin through, k6 stopped mid-run. The script now gives it no stdin and no pseudo-terminal, and kills k6 if it runs past its planned time. Each container is also limited to 1 GiB of memory.

## E: reliability

`pnpm benchmark:reliability` uses the same isolated stack. Ten clients on the host submit audits continuously, and each submission behaves like a careful real client. It uses its own `Idempotency-Key`, keeps that key on every retry, retries on network errors and 5xx responses with backoff from 250 ms to 2 s, and gives up after 60 seconds. Each scenario runs for 10 seconds, then the failure is injected, then it runs for another 30 seconds.

- **API crash.** `kill -9` on the Node process inside the API container. The container has an init process and an `on-failure` restart policy, so Docker restarts it the way a process supervisor would. A plain `docker kill` counts as a deliberate stop, and Docker wouldn't restart it.
- **Database outage.** `docker stop` on PostgreSQL, a 10-second wait, then `docker start`.
- **Duplicates.** The same key sent 20 times in a row, 50 times at once, and once with a different body.

Afterwards, SQL checks look for duplicate audits, audits a client was told were saved but that are missing, findings without an audit, findings that don't match the audit's stored reconciliation, and audits that aren't marked complete.

|                                            | API killed                           | Database down for 10 s          |
| ------------------------------------------ | ------------------------------------ | ------------------------------- |
| Audit submissions                          | 7,445                                | 7,554                           |
| Completed                                  | 100%                                 | 100%                            |
| Longest stretch with no audit completing   | 1.95 s                               | 11.54 s                         |
| Completions resumed after recovery         | 0.61 s after the API was ready again | 1.35 s after PostgreSQL started |
| Failed attempts (all retried successfully) | 30 network errors                    | 30 × 503                        |
| Integrity problems                         | 0                                    | 0                               |

With the duplicate tests, 20 sequential and 50 concurrent requests sharing a key each stored exactly one audit, and every response carried the same audit ID. Reusing a key with a different body was rejected with 422.

The first run of this benchmark exposed a weakness. While the database was down, 6 requests hung until the client gave up at 10 seconds, and 4 more failed with a plain 500 error. The database connection pool would wait indefinitely for a connection, and connection errors were reported as server bugs. The pool now gives up after 3 seconds, and connection failures return `503 SERVICE_UNAVAILABLE` with a `Retry-After` header. In the second run, all 30 failed attempts during the outage were clean 503s. Recovery time didn't change, because that depends on how long the database is down, not on the API.

That first run also had one audit completed by replay: the client lost the response to a request whose audit had already been saved, and its retry with the same key got the saved audit back instead of a duplicate. That's the situation idempotency keys exist for.

Records: `reliability-2026-10-24T15-42-02-606Z-6d4467.json` (first run) and `reliability-2026-10-24T15-49-32-351Z-b942b0.json` (after the 503 change).

The original benchmark plan also listed queue failures and worker restarts. WageGuard has no queue: an audit takes a few milliseconds to calculate, so it runs inside the request ([ADR 0010](adr/0010-audits-idempotency-and-immutability.md)). The closest thing to a worker restart is killing the API process mid-request, which is the crash scenario above. Queue wait and job processing times are recorded as not applicable.

## Caveats

- It's one laptop. Background load wasn't controlled, only recorded. For B and E, the load generator, the API and the database all share that machine.
- These are relative measurements. Before-and-after pairs ran on the same machine with the same workload and settings, minutes apart, which makes the comparisons fair. The absolute numbers say nothing about a deployed system.
- On Windows, `process.cpuUsage` has roughly 15 ms granularity, so CPU percentages for the smallest engine runs don't mean much.
- None of these benchmarks run in CI. Shared CI runners are too noisy for timing gates until that noise has been measured.

## Commands

```bash
BENCHMARK_LABEL=<label> pnpm benchmark:engine   # A ("baseline" and "optimised-*" labels feed F)
pnpm benchmark:equivalence                      # F: output equivalence
pnpm benchmark:correctness                      # D (run pnpm test:coverage first)
pnpm build && BENCHMARK_LABEL=<label> pnpm benchmark:database   # C
BENCHMARK_LABEL=<label> pnpm benchmark:api                      # B
BENCHMARK_LABEL=<label> pnpm benchmark:reliability              # E
pnpm benchmark:report                           # benchmarks/reports/summary.md
pnpm resume:metrics                             # docs/resume-evidence/
```

Records labelled `baseline` are compared against the most recent record with any other label. Use the label `smoke` to check that the B or E pipeline works without saving anything.
