# Contributing

WageGuard is a personal portfolio project, and the code is all rights reserved (see [LICENSE](LICENSE)). These notes describe how changes are made here. They're useful to anyone reading the history or reviewing a pull request.

## Making a change

1. Run `pnpm install`.
2. Make the change, with tests. Anything that touches the calculation needs unit tests, and property tests too when there's a rule that should always hold.
3. Before pushing, run `pnpm format && pnpm lint && pnpm typecheck && pnpm test:coverage`, and the Playwright tests if the web app changed (`pnpm --filter @wageguard/web e2e`).
4. Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) style, for example `feat(engine): flag public holiday shifts`.

## Rules that don't bend

A published rule set is never edited. Corrections go out as a new revision with its own fingerprint ([ADR 0003](docs/adr/0003-versioned-immutable-rule-sets.md)).

Golden scenarios are never changed to match what the engine produces. Their expected values are worked out separately from the award, and the working is written down with them.

Money is never a JavaScript `number`. Use `Money` or `Decimal`, and name the rounding mode whenever you round ([ADR 0004](docs/adr/0004-decimal-money-and-rounding.md)).

`packages/domain`, `award-rules` and `calculation-engine` don't import any framework, database or network code.

If a change could alter any result for the same input and rule set, bump `ENGINE_VERSION`.

Benchmark results and resume figures only ever come from saved records. Nothing is typed in by hand.

Only synthetic data, anywhere: in the code, the tests, the issues and any running copy of the app.

## On Windows

In Windows PowerShell 5.1, `Set-Content -Encoding utf8` writes a byte-order mark, and Node.js then can't parse `package.json`. Edit files in your editor, or write them with `[IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding $false))`.
