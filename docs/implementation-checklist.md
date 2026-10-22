# Implementation checklist

Legend: [x] done and verified · [~] partially done · [ ] not started

## Phase 0: Engineering setup

- [x] Repository inspected; toolchain versions verified against the npm registry (ADR 0006)
- [x] pnpm workspace, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] ESLint (strict type-checked) and Prettier, with monetary-safety lint rules
- [x] Docker Compose for PostgreSQL and Redis (written; **not run**, Docker daemon unavailable)
- [x] Documentation structure and ADRs
- [x] GitHub Actions CI (format, lint, typecheck, build, coverage-gated tests, rule-set integrity, `pnpm audit`, gitleaks). First green run on GitHub: https://github.com/ijfabi/wageguard/actions/runs/39777538158
- [x] git repository initialised and published (public, all rights reserved)

## Phase 1: Domain and calculation foundation

- [x] Money / Decimal with explicit rounding
- [x] LocalDate, LocalTime, Instant, TimeZone (DST-aware), half-open Interval
- [x] Employment, Shift and Break, PayPeriod, Payslip domain models
- [x] Rule-set schema, registry, immutability fingerprints
- [x] MA000004 2026-07-01 r1 rules transcribed from the official source
- [x] Calculation engine (segmentation, checks, pricing, aggregation, trace)
- [x] Reconciliation and audit findings
- [x] Unit, property and golden tests (217 passing; engine 98.6% lines / 93.1% branches)

## Phase 5 (started early): Benchmarking

- [x] Deterministic workload generator
- [x] Benchmark A, profiling, optimisation, Benchmark F with output equivalence
- [x] Benchmark D
- [x] Report and resume-evidence generators
- [ ] Benchmarks B, C and E (recorded as NOT_EXECUTED)

## Phase 2: Persistence and APIs

- [ ] Prisma schema, migrations, seed
- [ ] NestJS modules: identity, employments, shifts, payslips, audits, rules, health
- [ ] Immutable audit snapshots and idempotency keys
- [ ] Validation, authorisation, OpenAPI, rate limiting, correlation ids, structured logs
- [ ] Testcontainers integration tests and security tests

## Phase 3: Frontend

- [ ] Next.js app: auth, dashboard, employment, shifts, CSV upload, payslip, audits, explanation, settings
- [ ] Playwright E2E

## Phase 4: Engineering quality

- [ ] CSV importer, PDF report, OpenTelemetry, container scanning

## Phase 6: Portfolio delivery

- [ ] Screenshots, demo account, final review, deployment guide (Terraform optional)
