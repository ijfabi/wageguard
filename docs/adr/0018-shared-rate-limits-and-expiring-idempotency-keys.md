# ADR 0018: Rate limits and idempotency keys in PostgreSQL

- Status: Accepted
- Date: 2026-10-25

## Context

Rate-limit counters lived in each API process's memory, so they were only correct with a single instance: two instances would double every limit. Idempotency keys were a unique index on the audits table and never expired, so a client could never reuse one.

Redis is in the Compose file but unused, and neither cloud design includes it.

## Decision

Rate-limit counters move into a `rate_limit_buckets` table, one fixed-window row per client and limit. Each request is a single upsert on the row's primary key that either starts a new window or adds a hit, so concurrent requests from any instance count correctly. Once a client goes over the limit, the window is stretched to the block duration. About one request in a hundred also deletes long-expired rows. The client's identity is the throttler's hash, never the raw address. `RATE_LIMIT_STORE=memory` keeps the old in-process store, which the API tests use so parallel test files don't share counters. A separate test runs two app instances against one database and checks they share one budget.

Idempotency keys move into their own table, keyed by user and key, with an expiry 24 hours after the audit they produced. Inside the audit's transaction, an expired key is released and the new one inserted. The primary key still makes a concurrent duplicate fail and roll everything back. The migration copies every existing key across with an expiry based on its audit's creation time.

## Alternatives considered

Redis or Valkey would take the write off the database and is the better choice at higher volume. It's also another service to run, secure, back up and pay for in both clouds. PostgreSQL is already there, and a primary-key upsert is cheap. The production design in [infrastructure](../infrastructure.md) moves the counters to Valkey.

## Consequences

Every throttled request now costs one small database write. The API load benchmark was recorded before this change and hasn't been repeated, so its effect on throughput isn't measured yet.

If PostgreSQL is down, throttled routes fail with the same `503` as everything else that needs the database. Health checks skip the throttler, so liveness never depends on the database.

A retried audit is only recognised as a retry within 24 hours. After that, the same key with a different request creates a new audit instead of being refused.
