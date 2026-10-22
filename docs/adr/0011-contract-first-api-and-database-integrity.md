# ADR 0011: Contract-first API and database-enforced integrity

- Status: Accepted
- Date: 2026-10-22

## Context

Request and response types must not be duplicated across the API, the web client and the documentation. Ownership and overlap rules must hold even if application code has a bug.

## Decision

### Contracts

- `packages/api-contracts` defines every request and response as a Zod schema. It is the single source for:
  - **validation:** a small `ZodPipe` validates bodies, queries and params;
  - **TypeScript types:** inferred from the schemas, so the future web client and the API share them;
  - **the OpenAPI 3.1 document**, served at `/api/v1/openapi.json` and generated with `z.toJSONSchema`.
- Schemas are strict: unknown fields are rejected, which prevents mass assignment.
- A test asserts that the routes documented in OpenAPI exactly match the routes Nest registers.
- Engine output structures (calculation results, findings) stay typed by `@wageguard/calculation-engine` and appear as open objects in OpenAPI, rather than being re-declared.

We chose a custom pipe over Nest 12's built-in `StandardSchemaValidationPipe` because it maps issues to our documented error body directly.

### Database integrity

Implemented in the initial migration:

- **Composite ownership keys.** Shifts, payslips and audits reference their employment through a composite `(id, user_id)` foreign key, so a child can never point at another user's employment.
- **Immutable ownership.** Triggers forbid changing `user_id` on owned rows and `employment_id` on shifts and payslips. The composite keys use `ON UPDATE CASCADE`, so without this an ownership change would silently move children.
- **No overlapping shifts.** A `btree_gist` exclusion constraint over `tstzrange(start_at, end_at, '[)')` per employment, half-open to match the domain.
- **CHECK constraints** on shift ordering, pay period ordering and non-negative amounts.
- **Audit immutability triggers** (ADR 0010).
- **Drift check.** CI applies all migrations to an empty database and fails if `prisma migrate diff` finds drift from `schema.prisma`.

### Hexagonal discipline in the API

- The audit module depends on an `AuditRepository` port with a Prisma adapter, and on a `RuleSetResolver` port. These are the boundaries where alternative implementations are plausible.
- Simple CRUD services (employments, shifts, payslips) use the Prisma service directly. Wrapping every query in a repository interface would add indirection without a second implementation.
- All business rules stay in the pure packages, so the API layer contains orchestration and mapping only.

## Consequences

- A client generated from the OpenAPI document gets accurate request types, but generic response types for engine structures. The web client imports TypeScript types from the contracts and engine packages instead.
- Constraint violations surface as database errors. The global error filter maps them to `409 SHIFT_OVERLAP` and `409 VERSION_CONFLICT`.
