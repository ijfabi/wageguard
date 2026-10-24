# ADR 0006: Toolchain and dependency versions

- Status: Accepted
- Date: 2026-10-22

Versions were checked against the npm registry on 2026-10-22, and every dependency is pinned to an exact version (`save-exact=true`). As a rule, a new release isn't adopted until it's at least two weeks old.

| Tool                   | Chosen         | Newest available then | Why                                                                                                        |
| ---------------------- | -------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Node.js                | 24.x (24.22.1) |                       | The current long-term-support line. `engines` allows `>=24 <25`                                            |
| pnpm                   | 10.34.7        | 12.15.0               | A mature line with good workspace support. Moving to 12 should be easy, as a separate change               |
| TypeScript             | 6.0.3          | 7.0.2                 | `typescript-eslint` 8.72.0 only supports TypeScript below 6.1, and 7 would break the type-aware lint rules |
| Prisma                 | 7.10.1         | 8.0.0-rc.25           | The `latest` tag pointed at a release candidate. 7.10.1 was the newest stable release                      |
| Vitest and coverage-v8 | 5.0.5          | 5.0.5                 | Supports Node 24                                                                                           |
| Vite                   | 8.3.5          | 8.3.5                 | Imported by `vitest.shared.ts` for its server-side resolution defaults                                     |
| fast-check             | 4.10.2         | 4.10.2                |                                                                                                            |
| decimal.js             | 10.6.0         | 10.6.0                | A mature exact-decimal library, used through a private `Decimal.clone`                                     |
| luxon                  | 3.7.2          | 3.7.2                 | Only used for time-zone offsets, which are cached ([ADR 0007](0007-offset-table-optimisation.md))          |
| zod                    | 4.6.7          | 4.6.7                 | Rule-set schema, engine input and API contracts                                                            |
| ESLint                 | 10.13.0        | 10.13.0               | Flat config with `typescript-eslint`'s strict type-aware rules                                             |
| NestJS                 | 12.2.0         | 12.2.0                | The API                                                                                                    |
| Next.js                | 16.4.2         | 16.4.2                | The web app                                                                                                |
| PostgreSQL image       | 17.6-alpine    |                       | A well-established major version. Docker wasn't running on the day, so newer tags couldn't be checked      |
| Redis image            | 8.2-alpine     |                       | Same as PostgreSQL                                                                                         |

GitHub Actions are pinned to full commit hashes, looked up through the GitHub API on 2026-10-22. Libraries added in later phases (the OpenTelemetry packages, pdfkit, k6) followed the same two-week rule. Their versions and reasons are in the decision records that introduced them.

## When to revisit

- When `typescript-eslint` supports TypeScript 7.
- When Prisma 8 has a stable release.
