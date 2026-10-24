# ADR 0010: Audits run in the request, can be retried safely, and never change

- Status: Accepted
- Date: 2026-10-22

## Context

An audit has to be reproducible later, must never change once it's finished, and mustn't be duplicated by a retry or a double click. Redis and a job queue were only to be used for work that's genuinely asynchronous.

## Decision

### No queue

Benchmark A measured about 0.5 ms for the engine to calculate a 10-shift pay period, and a whole `POST /audits` request takes tens of milliseconds on a laptop. A queue would add a worker, retries, a job store and new ways to fail, with nothing measured to justify it. So audits are calculated inside the request, and their status is always `COMPLETED`. The status column still allows `PROCESSING` and `FAILED`, in case slow work turns up later, such as large bulk imports.

### Safe retries

Every `POST /audits` must carry an `Idempotency-Key` header, and the database makes `(user_id, idempotency_key)` unique. A hash of the request (the employment, the payslip and the sorted list of declared holidays) is stored alongside.

If the same key arrives with the same request, the saved audit is returned unchanged, with `200` and `Idempotent-Replayed: true`. If the same key arrives with a different request, it's refused with `422 IDEMPOTENCY_KEY_REUSED`. If several requests with the same key arrive at once, they all calculate, but only one insert succeeds. The others catch the unique-key violation, read the winning audit and return it. Either way, at most one audit is saved per key. Keys belong to one user, so two people can use the same key without clashing, and they don't expire yet.

This was tested with 10 concurrent requests, and again in Benchmark E with 50 concurrent requests, a killed API process and a database outage. None of those runs produced a duplicate or lost an acknowledged audit.

### Snapshots that can't change

Each audit row stores everything needed to reproduce and explain the result without looking at anything that might since have changed: the engine's input, the payslip, the full result and reconciliation, the rule-set version and fingerprint, the engine version, the input hash and the time of calculation.

A PostgreSQL trigger rejects any `UPDATE` to `audits` or `audit_findings`. It also rejects `DELETE` unless the current transaction has set `wageguard.allow_audit_delete` with `set_config(..., true)`. Only account deletion does that, and the setting disappears when the transaction ends. Employments and payslips that an audit refers to use `ON DELETE NO ACTION`, so they can't be deleted out from under it, but deleting a whole account still cascades through.

A test takes a stored input snapshot, runs it through the engine again with the same rule set and time, and checks the result is identical to the one stored.

## Consequences

Editing a shift or payslip later never changes an existing audit. To see the effect of an edit, run a new audit with a new key.

If the engine ever gets slow enough to need background processing, the place to add a queue is `AuditsService.create`. The guarantee of one audit per key already lives in the database, so it would survive that change.
