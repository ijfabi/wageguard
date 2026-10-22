# ADR 0006: Toolchain and dependency versions

- Status: Accepted
- Date: 2026-10-22

Versions were checked against the npm registry on 2026-10-22 and are pinned exactly (`save-exact=true`).

| Tool                 | Chosen              | Latest seen                        | Reason                                                                                                |
| -------------------- | ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Node.js              | 24.x (24.22.1 used) | n/a                                | Current LTS line installed on the development machine. `engines` restricts to `>=24 <25`.             |
| pnpm                 | 10.34.7             | 12.15.0                            | Mature line with workspace support. An upgrade to 12 is low risk and can be done separately.          |
| TypeScript           | 6.0.3               | 7.0.2                              | `typescript-eslint` 8.72.0 declares `typescript >=4.8.4 <6.1.0`. TS 7 would break type-aware linting. |
| Prisma               | 7.10.1 (planned)    | `latest` tag points to 8.0.0-rc.25 | The `latest` dist-tag is a release candidate. 7.10.1 is the last stable release (`prev` tag).         |
| Vitest / coverage-v8 | 5.0.5               | 5.0.5                              | Supports Node 24.                                                                                     |
| Vite                 | 8.3.5               | 8.3.5                              | Imported directly by `vitest.shared.ts` for SSR condition defaults.                                   |
| fast-check           | 4.10.2              | 4.10.2                             |                                                                                                       |
| decimal.js           | 10.6.0              | 10.6.0                             | Mature exact-decimal library; isolated via `Decimal.clone`.                                           |
| luxon                | 3.7.2               | 3.7.2                              | IANA zone offsets only. Lookups are memoised (ADR 0007).                                              |
| zod                  | 4.6.7               | 4.6.7                              | Rule-set schema and engine input contract.                                                            |
| ESLint               | 10.13.0             | 10.13.0                            | Flat config with `typescript-eslint` strict type-checked rules.                                       |
| NestJS               | 12.2.0 (planned)    | 12.2.0                             | Phase 2.                                                                                              |
| Next.js              | 16.4.2 (planned)    | 16.4.2                             | Phase 3.                                                                                              |
| PostgreSQL image     | 17.6-alpine         | n/a                                | Known stable major; Docker daemon unavailable to verify newer tags on 2026-10-22.                     |
| Redis image          | 8.2-alpine          | n/a                                | As above.                                                                                             |

GitHub Actions are pinned to full commit SHAs, resolved via the GitHub API on 2026-10-22.

## Revisit when

- `typescript-eslint` supports TypeScript 7.
- Prisma 8 reaches a stable `latest` release.
