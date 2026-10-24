# Implementation checklist

`[x]` means done and verified, `[ ]` means not started.

## Phase 0: setup

- [x] Toolchain versions checked against the npm registry ([ADR 0006](adr/0006-toolchain-versions.md))
- [x] pnpm workspace with strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] ESLint (strict, type-aware) and Prettier, plus lint rules that block floating-point money
- [x] Docker Compose stack, checked with `docker compose up --build` on 2026-10-22
- [x] Documentation and decision records
- [x] GitHub Actions CI with actions pinned to commit hashes ([first green run](https://github.com/ijfabi/wageguard/actions/runs/39777538158))
- [x] Public repository, all rights reserved

## Phase 1: domain and calculation

- [x] Money and decimal types with explicit rounding
- [x] Dates, times, instants and time zones (aware of daylight saving), half-open intervals
- [x] Employment, shift, break, pay period and payslip models
- [x] Rule-set schema, registry and immutability fingerprints
- [x] MA000004 rules effective 1 July 2026, copied from the official award
- [x] Calculation engine: segmentation, checks, pricing, aggregation and the explanation trace
- [x] Reconciliation against payslips, with findings
- [x] Unit, property-based and golden tests

## Phase 2: persistence and API

- [x] Prisma 7 schema and migrations, with the shift-overlap exclusion constraint, CHECK constraints and immutability triggers
- [x] Migration drift check in CI
- [x] `api-contracts` package: Zod schemas used for validation, types and the OpenAPI document
- [x] Accounts: register, sign in and out, current user, delete account (argon2id, server-side sessions stored hashed)
- [x] Employments, shifts (including edits with optimistic concurrency and CSV import) and payslips
- [x] Audits: idempotent creation, immutable snapshots, list, detail, lines, JSON report
- [x] Rule versions, health, readiness, OpenAPI 3.1 with a test that every route is documented
- [x] Rate limiting, a CSRF origin check, authentication, one error format, correlation IDs, redacted structured logs, security headers, body limits
- [x] Integration tests on real PostgreSQL (Testcontainers) and contract tests
- [x] Security tests: other users' objects, cross-user writes, bad and oversized CSV, duplicate and concurrent audits, invalid dates and daylight-saving times, injection attempts
- [x] API Docker image (multi-stage, non-root, health check), migration container, Trivy scan in CI
- [x] Demo account seed script (the password comes from the environment, never the repository)

## Phase 3: web app

- [x] Next.js 16 app covering sign-up and sign-in, dashboard, employment, shifts, CSV upload, payslips, audit history, audit detail, the calculation explanation and settings ([ADR 0012](adr/0012-web-frontend-architecture.md))
- [x] `GET /payslips` and `GET /dashboard` endpoints with integration tests
- [x] Unit tests for the web logic (19 in `apps/web`, 14 in `packages/presentation`)
- [x] 10 Playwright end-to-end tests: the full audit journey with PDF and JSON downloads, an underpayment, a malformed CSV, access control, open-redirect protection, the content security policy, signing in without JavaScript, and the skip link
- [x] axe accessibility checks (WCAG 2.1 AA) across 13 page states
- [x] Web Docker image, Compose service, end-to-end tests and image scan in CI
- [x] README screenshots from the demo account

## Phase 4: engineering quality

- [x] PDF audit report built from the stored snapshot ([ADR 0014](adr/0014-pdf-evidence-report.md))
- [x] `@wageguard/presentation`: shared wording for money, dates and statuses, used by the web app and the PDF
- [x] Optional OpenTelemetry traces and metrics, with redaction and audit metrics ([ADR 0013](adr/0013-opt-in-opentelemetry.md), [observability](observability.md)), checked against a local collector
- [x] Nonce-based content security policy for the web app, with end-to-end violation checks
- [x] Sign-in and account-deletion forms use POST, so credentials never land in a URL even before JavaScript loads
- [x] Container, dependency and secret scanning in CI
- [ ] A Unicode font and a tagged, accessible PDF; monitoring dashboards and alerts; tracing in the web app

## Phase 5: benchmarking

- [x] Deterministic workload generator; Benchmarks A, D and F; report and resume-evidence generators
- [x] Benchmark C: database queries at 500 to 50,000 audits, with statement counts and EXPLAIN ANALYZE
- [x] Benchmark B: the API under load with k6 at 1 to 50 concurrent clients, against the production image
- [x] Benchmark E: duplicate submissions, an API crash and a database outage, with integrity checks afterwards
- [x] Fixes for the problems the benchmarks found (column selection, covering indexes, batched import, failing fast with 503), re-measured before and after ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md), [performance](performance.md))

## Phase 6: delivery

- [ ] Final review, deployment guide, and an optional cloud design (never applied without approval)
