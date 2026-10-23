# Implementation checklist

Legend: [x] done and verified · [~] partially done · [ ] not started

## Phase 0: Engineering setup

- [x] Toolchain versions verified against the npm registry (ADR 0006)
- [x] pnpm workspace, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] ESLint (strict type-checked) and Prettier, with monetary-safety lint rules
- [x] Docker Compose stack: verified with `docker compose up --build` on 2026-10-22
- [x] Documentation structure and ADRs 0001–0011
- [x] GitHub Actions CI with SHA-pinned actions. First green run: https://github.com/ijfabi/wageguard/actions/runs/39777538158
- [x] git repository initialised and published (public, all rights reserved)

## Phase 1: Domain and calculation foundation

- [x] Money / Decimal with explicit rounding
- [x] LocalDate, LocalTime, Instant, TimeZone (DST-aware, memoised offsets), half-open Interval
- [x] Employment, Shift and Break, PayPeriod, Payslip domain models
- [x] Rule-set schema, registry, immutability fingerprints
- [x] MA000004 2026-07-01 r1 rules transcribed from the official source
- [x] Calculation engine (segmentation, checks, pricing, aggregation, trace)
- [x] Reconciliation and audit findings
- [x] Unit, property and golden tests

## Phase 2: Persistence and APIs

- [x] Prisma 7 schema, initial migration with exclusion constraint, CHECKs and immutability triggers
- [x] Migration drift check in CI (apply to an empty database, then `migrate diff --exit-code`)
- [x] `api-contracts` package: Zod contracts as the single source for validation, types and OpenAPI
- [x] Identity: register, login, logout, me, account deletion (argon2id, hashed server-side sessions)
- [x] Employments, shifts (create, list, get, optimistic-concurrency patch, CSV import), payslips
- [x] Audits: idempotent creation, immutable snapshots, list, detail, lines, JSON report
- [x] Rules versions, health, readiness, OpenAPI 3.1 document with a route-parity test
- [x] Global guards (rate limit, CSRF origin, authentication), error filter, correlation ids, structured redacted logs, security headers, body limits
- [x] Integration tests on real PostgreSQL via Testcontainers (63), contract tests (7)
- [x] Security tests: BOLA, cross-user access, malformed and oversized CSV, duplicate and concurrent audits, invalid dates and DST times, injection
- [x] API Docker image (multi-stage, non-root, health check); migrate service; Trivy scan in CI
- [x] Seeded synthetic demo account (`seed:demo`; password from the environment, never committed)

## Phase 3: Frontend

- [x] Next.js 16 app: landing, sign up/in, dashboard, employment, shifts, CSV upload, payslip, audit history, audit detail, calculation explanation, settings (ADR 0012)
- [x] `GET /payslips` and `GET /dashboard` API endpoints with integration tests
- [x] 23 unit tests for web logic (money, formatting, form mapping, redirects, status presentation)
- [x] Playwright E2E (8 tests): full audit journey with report download, underpayment, malformed CSV, access control, open-redirect protection, keyboard skip link
- [x] axe accessibility checks (WCAG 2.1 AA, serious/critical fail) across 13 page states
- [x] Web Docker image (standalone, non-root), Compose `web` service, CI E2E job and web image scan
- [x] README screenshots from the seeded synthetic account

## Phase 4: Engineering quality

- [ ] PDF audit report
- [ ] OpenTelemetry traces and metrics
- [~] Container scanning (Trivy in CI) and dependency/secret scanning: done; runtime hardening review pending

## Phase 5: Benchmarking

- [x] Deterministic workload generator; Benchmarks A, D, F; report and resume-evidence generators
- [ ] Benchmark B (API with k6), C (database queries with EXPLAIN ANALYZE), E (reliability): now unblocked by Phase 2

## Phase 6: Portfolio delivery

- [ ] Screenshots, demo account, final review, deployment guide (Terraform optional, never applied without approval)
