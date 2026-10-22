# ADR 0001: Modular monolith with hexagonal boundaries

- Status: Accepted
- Date: 2026-10-22

## Context

WageGuard needs clear separation between payroll rules, calculation, persistence and HTTP, and it must be explainable and testable. The expected load is small, and one developer maintains it.

## Decision

- Build a modular monolith in one pnpm workspace, not microservices.
- Keep the domain (`packages/domain`), the rule data (`packages/award-rules`) and the calculation engine (`packages/calculation-engine`) as pure TypeScript packages. They must not import NestJS, Prisma, HTTP or React code.
- The engine depends on ports, not adapters. For example, `RuleSetResolver` is a port; `AwardRuleRegistry` implements it today, and a database-backed implementation can replace it later without engine changes.
- `apps/api` (NestJS) and `apps/web` (Next.js) are adapters around these packages.

## Consequences

- The engine runs and is tested with no server or database. This is how its tests and Benchmark A run.
- One deployable unit keeps deployment, transactions and debugging simple.
- Module boundaries are enforced by package dependencies, not by network calls. A boundary violation shows up as a new `dependencies` entry, which is visible in review.
- If one module ever needs independent scaling, its package boundary is already the seam to extract along.
