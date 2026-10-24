# Testing

Most tests use Vitest. They're spread across the packages:

| Kind of test                       | Where                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit                               | `packages/*/test`, `apps/web/src/lib/lib.test.ts`                                                                             |
| Property-based (fast-check)        | `packages/domain/test/{money,interval,canonical,offset-table}.test.ts`, `packages/calculation-engine/test/properties.test.ts` |
| Golden scenarios                   | `packages/test-fixtures/test/golden.test.ts`, plus `pnpm benchmark:correctness`                                               |
| API integration on real PostgreSQL | `apps/api/test/*.test.ts`                                                                                                     |
| API contracts and OpenAPI          | `packages/api-contracts/test`, and the route check in `apps/api/test/platform.test.ts`                                        |
| Security                           | `apps/api/test/security.test.ts`, plus security cases in the other API suites                                                 |
| PDF report                         | `apps/api/test/audits.test.ts` (extracts the PDF's text and checks wording, amounts and page breaks), `audit-pdf.test.ts`     |
| Telemetry privacy                  | `apps/api/test/telemetry.test.ts` (in-memory exporters)                                                                       |
| Error mapping                      | `apps/api/test/error-filter.test.ts`                                                                                          |
| End to end and accessibility       | `apps/web/e2e/*.spec.ts` (Playwright and axe, against the production web build, a real API and PostgreSQL)                    |

The API tests live in `apps/api/test` rather than a shared top-level folder so they run with the app's own Vitest setup. Each run starts a throwaway `postgres:17.6-alpine` container and applies the real migrations, so the constraints and triggers being tested are the same ones production has.

## Properties the engine must always satisfy

The property-based tests generate thousands of random inputs and check rules that should hold for every one of them:

- Paid time split into segments adds back up to the shift minus its unpaid meal breaks, with no overlaps, gaps or empty segments.
- The pay-period total equals the sum of its lines and is never negative. Each line is within half a cent of the exact product.
- A fully calculated result has priced every paid minute. Any other status names at least one reason. Hours outside the span and on public holidays are never priced.
- The same input always gives the same output, whatever order the shifts arrive in.
- Unsupported or unconfirmed employment is never priced.
- When daylight saving starts during a shift, its elapsed time is the wall-clock time minus the missing hour.

The domain types get the same treatment. Adding money is associative and commutative, subtracting undoes adding, and values survive a JSON round trip. Interval subtraction is checked minute by minute. Canonical hashing ignores key order. The cached time-zone offsets match a direct lookup at 5,000 random instants across 8 zones.

## Coverage

`pnpm test:coverage` fails if coverage drops below these thresholds:

- `domain`, `award-rules`, `calculation-engine` and `presentation`: 90% of lines, branches, functions and statements.
- `apps/api`: 90% of lines, statements and functions, and 80% of branches.
- `api-contracts`, `test-fixtures` and the web unit tests have no threshold. The web app is mostly covered by the Playwright tests.

Benchmark D also reports the engine's coverage. High coverage shows that the code runs under test. It doesn't show that the pay calculations are legally right.

## Three kinds of test data

They're kept apart on purpose:

- **Golden scenarios** (`packages/test-fixtures/src/golden`) have expected values worked out by hand from the award's published rates. They are never edited to make a failing test pass.
- **Benchmark workloads** (`packages/test-fixtures/src/workload.ts`) are generated from a fixed seed and only used to measure speed.
- **Demo data** comes from `pnpm --filter @wageguard/api seed:demo` and only exists to make the app look lived in. It isn't a correctness check.

## Commands

```bash
pnpm test             # every unit, property, golden and API test
pnpm test:coverage    # the same, with the coverage thresholds
pnpm test:evidence    # also writes JSON reports to benchmarks/test-reports/ for resume:metrics
pnpm --filter @wageguard/web e2e   # Playwright (needs PostgreSQL)
```
