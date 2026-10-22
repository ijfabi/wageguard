# Contributing

## Workflow

1. `pnpm install`
2. Make the change with tests. Calculation changes need unit tests, and property tests where an invariant applies.
3. Before pushing: `pnpm format && pnpm lint && pnpm typecheck && pnpm test:coverage`
4. Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(engine): flag public holiday shifts`.

## Rules that are not negotiable

- **Never edit a published rule set.** Publish a new revision and record its fingerprint ([ADR 0003](docs/adr/0003-versioned-immutable-rule-sets.md)).
- **Never change a golden expectation to match engine output.** Golden values must be derived independently from the source and show their derivation.
- **No `number` for money.** Use `Money` or `Decimal` and name the rounding mode ([ADR 0004](docs/adr/0004-decimal-money-and-rounding.md)).
- **No framework imports in `packages/domain`, `award-rules` or `calculation-engine`.**
- **Bump `ENGINE_VERSION`** when a change can alter any result for the same input and rule set.
- **No fabricated numbers.** Benchmarks and resume metrics come only from saved records.
- **Synthetic data only.**

## Windows note

Windows PowerShell 5.1 `Set-Content -Encoding utf8` writes a UTF-8 byte-order mark, and Node.js then fails to parse `package.json`. Edit files with your editor, or write them with `[IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding $false))`.
