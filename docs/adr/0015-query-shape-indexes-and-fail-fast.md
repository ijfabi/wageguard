# ADR 0015: Query shapes, covering indexes and failing fast when the database is down

- Status: Accepted
- Date: 2026-10-24

## Context

Benchmarks C and E (see [performance](../performance.md)) found four problems that only showed up once there was real volume, and one that only showed up when something failed.

The audit history, detail and lines endpoints all loaded every column of an audit, including four JSON snapshots that together make up most of the row. The history page shows none of them. For 20 rows the query took 0.12 ms in PostgreSQL, but the service call took about 6 ms, nearly all of it spent moving and parsing JSON.

The dashboard added up `shift_count` and `difference` across all of a user's audits. Neither column was in an index, so both sums scanned the whole table, and the dashboard got slower as history grew (23.5 ms at 50,000 audits). Payslip history filtered by user and sorted by creation time, and there was no index for that either.

The CSV import created each shift and its breaks with a nested write, then re-read them, which comes to four statements a row and 60 for a 14-row file.

And while the database was down, requests waited indefinitely for a connection. When they did fail, the error came back as a 500, which tells a client "this is a bug" instead of "try again shortly".

## Decision

Each audit read now selects only the columns its response needs. The repository defines a summary column set (no snapshots) for history and the dashboard, a detail set (the reconciliation and result snapshots, but not the input or payslip copies), a result-only set for the lines view, and the full row only for evidence reports. The detail read no longer joins `audit_findings`, because the response takes its findings from the reconciliation snapshot.

The `(user_id, finding_status, created_at DESC)` index on audits now also includes `shift_count` and `difference`, so every dashboard query can be answered from the index alone. Prisma can't declare `INCLUDE` columns, so they're added as trailing key columns instead. That keeps the schema and migrations in agreement, which CI checks. The leading columns are unchanged, so filtering history by status still uses the same index. Payslips get a new `(user_id, created_at DESC, id)` index.

CSV import inserts all of a file's shifts in one `INSERT … RETURNING` and all of their breaks in another, inside the same transaction. Overlapping rows are rejected before anything is written, so the start time identifies each shift within an import, and the database's no-overlap constraint still catches clashes with shifts that already exist.

The database pool now gives up on a connection after 3 seconds. Connection failures (refused, reset, DNS errors, connect timeouts, and the server shutting down or starting up) map to `503 SERVICE_UNAVAILABLE` with `Retry-After: 2`. Anything else unexpected is still a generic 500.

## Results

With 50,000 audits, history got 77.6% faster, the dashboard 62.3% and the import 78.5%, and the import went from 60 statements to 6. End to end, with 50 concurrent clients, the API handled 54.9% more requests per second and its p95 latency fell by 29.6%. During a 10-second database outage, every failed attempt was now a 503 instead of a mix of hung requests and 500s, and every audit still completed once the client retried.

## Consequences

The covering index is wider than it strictly needs to be, so writes cost slightly more. Audits are written once and never updated, so that's a good trade.

Creating these indexes on a large live table would lock it against writes while the index builds. The migration uses plain `CREATE INDEX`, which is fine for a new deployment. On an existing large database, the indexes should be built with `CREATE INDEX CONCURRENTLY` outside a transaction before the migration runs.

The dashboard still adds up all of a user's audits on every request. It's index-only now, but it still grows with history. If that ever matters, a small per-user summary table updated when audits are written would make it constant time.
