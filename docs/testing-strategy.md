# Testing strategy

| Layer                         | Tool                                | Where                                                                                                                             | Status      |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Unit                          | Vitest                              | `packages/*/test/*.test.ts`                                                                                                       | Implemented |
| Property-based                | fast-check                          | `domain/test/{money,interval,canonical,offset-table}.test.ts`, `calculation-engine/test/properties.test.ts`                       | Implemented |
| Golden correctness            | Vitest + evaluator                  | `test-fixtures/test/golden.test.ts`, `pnpm benchmark:correctness`                                                                 | Implemented |
| Integration (real PostgreSQL) | Vitest + Testcontainers + Supertest | `apps/api/test/{auth,shifts,audits,dashboard,platform,telemetry}.test.ts`                                                         | Implemented |
| Contract                      | Vitest                              | `packages/api-contracts/test/contracts.test.ts`; OpenAPI route-parity test in `apps/api/test/platform.test.ts`                    | Implemented |
| Security                      | Vitest + Supertest                  | `apps/api/test/security.test.ts` (BOLA, cross-user, database bypass, injection, deletion) plus security cases in the other suites | Implemented |
| End-to-end + accessibility    | Playwright + axe-core               | `apps/web/e2e/{journey,access}.spec.ts` (real API, real PostgreSQL, production web build)                                         | Implemented |
| Web unit                      | Vitest                              | `apps/web/src/lib/lib.test.ts`, `packages/presentation/test`                                                                      | Implemented |
| PDF report                    | Vitest + unpdf                      | `apps/api/test/audits.test.ts` (text extraction: wording, amounts, provenance, page breaks); `audit-pdf.test.ts`                  | Implemented |
| Telemetry privacy             | Vitest + in-memory OTel exporters   | `apps/api/test/telemetry.test.ts`                                                                                                 | Implemented |

API tests live beside the app (`apps/api/test`) rather than in a top-level `tests/` folder, so that each suite runs with the app's own Vitest configuration (decorator transform, Testcontainers global setup). Each run starts a throwaway `postgres:17.6-alpine` container and applies the real migrations, so triggers and constraints are exercised exactly as in production.

## Property-based invariants (engine)

- Segmented paid time equals shift time minus unpaid meal breaks, with no overlap, gaps or zero-length segments.
- The pay period total equals the sum of its lines, and is never negative. Every line is within half a cent of the exact product.
- A `CALCULATED` result prices every paid minute. Any other status names at least one blocking issue. Outside-span and holiday minutes are never priced.
- The result is deterministic and independent of input shift order.
- Unsupported or unconfirmed employment is never priced.
- Inside a pay period containing a DST start, elapsed minutes equal wall-clock minutes minus the 60-minute gap when a shift spans it.
- In the domain: Money addition is associative and commutative, subtract inverts add, and JSON round-trips without loss. Interval subtraction is checked minute by minute. Canonical JSON hashing ignores key order. The offset table matches the direct zone lookup at 5,000 random instants across 8 zones.

## Coverage gates

`pnpm test:coverage` fails below these thresholds:

- `domain`, `award-rules`, `calculation-engine` and `presentation`: 90% lines, branches, functions and statements.
- `apps/api`: 90% lines, statements and functions, and 80% branches.
- `api-contracts`, `test-fixtures` and the web unit tests run without a gate. The web app is covered mainly by Playwright.

The calculation engine's coverage is also reported by Benchmark D. **Coverage is not evidence of legal correctness.**

## Golden scenarios versus demonstration data

- **Golden scenarios** (`test-fixtures/src/golden`) are correctness fixtures whose expected values were derived independently from the award's published rates. They are never edited to match engine output.
- **Benchmark workloads** (`test-fixtures/src/workload.ts`) are synthetic, seeded and versioned, and are used only for performance.
- **Demonstration data** for the UI comes from a separate synthetic seed (`pnpm --filter @wageguard/api seed:demo`). It is not a correctness fixture.

## Commands

```bash
pnpm test             # all unit, property and golden tests
pnpm test:coverage    # with coverage thresholds
pnpm test:evidence    # also writes Vitest JSON reports to benchmarks/test-reports/ (used by resume:metrics)
```
