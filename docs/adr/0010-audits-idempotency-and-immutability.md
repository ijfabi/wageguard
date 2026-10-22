# ADR 0010: Synchronous, idempotent, immutable audits

- Status: Accepted
- Date: 2026-10-22

## Context

An audit must be reproducible, must not change after it is completed, and must not be duplicated by retries or double-clicks. The brief permits Redis/BullMQ only for genuinely asynchronous workloads.

## Decision

### Synchronous processing (no queue yet)

- Benchmark A measured about 0.5 ms per 10-shift pay period for the engine, and the whole `POST /audits` request takes tens of milliseconds locally. A queue would add a worker, retries, a job store and failure modes without a measured need.
- Audits are therefore computed inside the request, and `status` is always `COMPLETED`.
- The enum leaves room for `PROCESSING` and `FAILED` if a slow workload appears, such as PDF rendering or bulk imports.

### Idempotency (`Idempotency-Key` header, required)

- `(user_id, idempotency_key)` is unique in the database. The request hash covers the employment, the payslip and the sorted declared holidays.
- **Same key, same request:** the stored audit is returned with `200` and `Idempotent-Replayed: true`, unchanged.
- **Same key, different request:** `422 IDEMPOTENCY_KEY_REUSED`.
- **Concurrent requests with the same key:** all compute, one insert wins, and the losers catch the unique violation (P2002), read the winner and replay it.
- **Result:** at most one audit is persisted per key. Tested with 10 concurrent requests.
- Keys never expire in this version. Keys are scoped per user, so two users can use the same key value.

### Immutable snapshots

- The audit row stores everything needed to reproduce and explain the result without reading mutable data again:
  - the engine input snapshot
  - the payslip snapshot
  - the full engine result and the reconciliation
  - the rule-set version and fingerprint
  - the engine version, the input hash and `calculated_at`
- A PostgreSQL trigger rejects `UPDATE` on `audits` and `audit_findings`, and rejects `DELETE` unless the transaction has run `set_config('wageguard.allow_audit_delete', 'on', true)`. Only the account-deletion workflow does that, and the setting is transaction-local.
- Employments and payslips referenced by audits use `ON DELETE NO ACTION`, so they cannot be deleted from under an audit, while a whole-account cascade still succeeds.
- A test recomputes the stored input snapshot with the same rule set and `calculated_at`, and checks the result is byte-identical to the stored result.

## Consequences

- Later edits to shifts or payslips never change an existing audit. Running a new audit after edits needs a new key.
- If the engine ever becomes slow enough to need background processing, the queue boundary sits at `AuditsService.create`. Its idempotency guarantees already hold at the database level.
