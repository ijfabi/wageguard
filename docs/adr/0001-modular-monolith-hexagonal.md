# ADR 0001: One application, with the calculation kept separate from everything else

- Status: Accepted
- Date: 2026-10-22

## Context

WageGuard has distinct concerns: the award rules, the pay calculation, storage and the web layer. They need clean boundaries so the calculation can be explained and tested on its own. The load will be small, and one person maintains it.

## Decision

WageGuard is a single application (a modular monolith) in one pnpm workspace, not a set of services.

The domain types (`packages/domain`), the rule data (`packages/award-rules`) and the calculation engine (`packages/calculation-engine`) are plain TypeScript packages. They're not allowed to import NestJS, Prisma, HTTP or React code.

Where the engine needs something from outside, it asks through an interface rather than a concrete implementation. Rules, for example, come through `RuleSetResolver`. Today the bundled `AwardRuleRegistry` answers it, and a database-backed version could take its place without the engine changing. The API (`apps/api`, NestJS) and the web app (`apps/web`, Next.js) are wrappers around these packages.

## Consequences

The engine runs and is tested with no server or database at all. That's how its tests and Benchmark A work.

A single deployable unit keeps deployment, transactions and debugging simple.

Package dependencies enforce the boundaries rather than network calls. If someone breaks a boundary, a new entry turns up in a `package.json`, where it's easy to spot in review. If one part ever needs to scale on its own, its package boundary is already the place to split it out.
