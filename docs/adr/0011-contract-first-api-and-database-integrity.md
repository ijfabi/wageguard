# ADR 0011: One set of API contracts, and integrity rules the database enforces

- Status: Accepted
- Date: 2026-10-22

## Context

Request and response types shouldn't be written out separately in the API, the web client and the documentation, where they'd drift apart. Rules about ownership and overlapping shifts need to hold even if the application code has a bug.

## Decision

### Contracts

`packages/api-contracts` defines every request and response as a Zod schema, and those schemas are used everywhere. A small `ZodPipe` validates request bodies, queries and parameters against them. The TypeScript types are inferred from them, so the API and the web app share the same types. The OpenAPI 3.1 document at `/api/v1/openapi.json` is generated from them with `z.toJSONSchema`.

The schemas are strict, so unknown fields are rejected, which stops clients from setting fields they shouldn't. A test checks that the routes in the OpenAPI document exactly match the routes the API actually registers. The engine's own output structures, such as calculation results and findings, keep their types from `@wageguard/calculation-engine` and appear as open objects in OpenAPI, rather than being described twice.

The API uses this small custom pipe rather than Nest 12's `StandardSchemaValidationPipe`, because it maps validation problems straight onto the documented error format.

### Integrity in the database

The first migration sets these rules up:

- **Children can't point at another user's parent.** Shifts, payslips and audits reference their employment through a composite `(id, user_id)` foreign key.
- **Ownership never changes.** Triggers stop `user_id` changing on any owned row, and `employment_id` changing on shifts and payslips. The composite keys cascade on update, so without the triggers, changing an owner would quietly move all their children with it.
- **Shifts can't overlap.** A `btree_gist` exclusion constraint over `tstzrange(start_at, end_at, '[)')` per employment. The range includes its start and excludes its end, matching the domain code.
- **CHECK constraints** keep shifts and pay periods in order and amounts non-negative.
- **Audits can't change**, as described in [ADR 0010](0010-audits-idempotency-and-immutability.md).

CI applies every migration to an empty database and fails if `prisma migrate diff` finds any difference from `schema.prisma`.

### Where the boundaries are in the API

The audit module talks to an `AuditRepository` interface backed by Prisma, and gets its rules through the `RuleSetResolver` interface. Those are the two places where a different implementation is realistic. The simple create-and-read services (employments, shifts, payslips) use Prisma directly, because wrapping every query in an interface would add indirection with no second implementation to justify it. Business rules all live in the pure packages, so the API layer only coordinates and maps data.

## Consequences

A client generated from the OpenAPI document gets accurate request types but loose types for the engine's structures. The web app imports its types from the contracts and engine packages instead.

When a constraint is violated, the database raises the error. The global error filter turns those errors into `409 SHIFT_OVERLAP` and `409 VERSION_CONFLICT`.
