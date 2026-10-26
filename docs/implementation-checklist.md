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
- [x] An embedded PDF font covering Latin, Greek, Cyrillic, Hebrew and more (DejaVu Sans)
- [ ] A tagged, accessible PDF; monitoring dashboards and alerts; tracing in the web app

## Phase 5: benchmarking

- [x] Deterministic workload generator; Benchmarks A, D and F; report and resume-evidence generators
- [x] Benchmark C: database queries at 500 to 50,000 audits, with statement counts and EXPLAIN ANALYZE
- [x] Benchmark B: the API under load with k6 at 1 to 50 concurrent clients, against the production image
- [x] Benchmark E: duplicate submissions, an API crash and a database outage, with integrity checks afterwards
- [x] Fixes for the problems the benchmarks found (column selection, covering indexes, batched import, failing fast with 503), re-measured before and after ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md), [performance](performance.md))

## Phase 6: delivery

- [x] Final code review. Fixed: simultaneous sign-ups returning 500, expired sessions never cleaned up, a corrupted password hash read as a wrong password, and rate limits that would have been shared by every user behind a load balancer (`TRUST_PROXY`)
- [x] UI polish from a page-by-page review at desktop and phone widths: tables that overflowed on phones, misaligned form fields, legends straddling borders, a clipped CSV example, raw weekday codes and shift IDs on the explanation page
- [x] Demo account seed and a recorded end-to-end walkthrough ([demo](demo.md))
- [x] Optional AWS and Azure deployments in Terraform, validated in CI and never applied ([infrastructure](infrastructure.md), [deployment](deployment.md))
- [x] Backup and recovery runbook (local restore tested) and incident response runbook
- [x] Acceptance check against all 15 criteria ([acceptance](acceptance.md))
- [x] Resume evidence regenerated from saved records
- [x] Homepage with an animated sample audit, word-for-word award quotes (tested against the retrieved award text) and measured results
- [x] Accessibility panel (theme, text size, motion, contrast), pause controls for all motion, reflow at 320 pixels, and axe checks in every display mode ([ACCESSIBILITY.md](../ACCESSIBILITY.md))
- [x] Documentation: information architecture, full database schema, API route map and request lifecycle, infrastructure and cloud design, Terraform commands, testing levels with UAT scenarios and a test case table

## After delivery: the known limitations

- [x] Rule set r2 ([ADR 0016](adr/0016-rule-set-revisions.md)): overtime, public holidays, minimum engagement, short breaks between work days, the cl. 15.2 span exceptions, Levels 1 to 8, full-time and junior rates, shiftwork, allowances and leave, with every Schedule B rate reproduced by a test
- [x] State and territory public holiday calendar for 2026 and 2027, from the Fair Work Ombudsman's lists
- [x] Shifts from the 13 days before a pay period count towards its weekly limits, and part-time hours can be varied in writing per day
- [x] Email verification without revealing who has an account, password reset, password change, signed-in devices and two-step sign-in ([ADR 0017](adr/0017-account-security.md))
- [x] Rate limits shared across API instances, and idempotency keys that expire after 24 hours ([ADR 0018](adr/0018-shared-rate-limits-and-expiring-idempotency-keys.md))
- [x] Editable employments; the ownership trigger fixed so updates work
- [x] Daylight-saving choice for shifts in the repeated hour, in the web form
- [x] Redesigned web app: sidebar layout, self-hosted Inter, new auth pages, sectioned forms, consistent tables, stat tiles and status pills
- [x] Mailpit in Docker Compose; SMTP and two-step key settings in both Terraform stacks
- [ ] A golden set reviewed by a payroll professional, and a cross-check against the Fair Work Pay Calculator
- [ ] Repeat the API, database and reliability benchmarks on the current code
