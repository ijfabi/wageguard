# Known limitations

WageGuard is an informational tool, not legal advice, and it does not determine award coverage.

## Legal and calculation scope

- **Award and classification.** Only MA000004 Retail Employee Level 1, adult, casual or part-time non-shiftworkers, in pay periods starting on or after 1 July 2026. Everything else is `UNSUPPORTED_SCENARIO`.
- **Not calculated, only flagged.** These are detected and flagged but never calculated:
  - overtime
  - public holidays
  - minimum engagement top-ups
  - cl. 16.6 break-between-work-days pay
  - cl. 15.2 span exceptions (newsagencies, video shops, extended trading to 11 pm)
- **Outside scope entirely.** Allowances, leave loading, leave, junior and apprentice rates, shiftwork, rostered days off, time off instead of overtime, and enterprise agreements.
- **Public holidays.** Only dates the user declares are treated as public holidays; there is no state calendar.
- **Weekly and daily checks.** These only see shifts supplied in the same pay period. A week that spans two pay periods is checked only partially.
- **Part-time guaranteed hours.** These are a single per-weekday figure. Written temporary variations (cl. 10.6) and agreed start and finish times (cl. 10.5(b)) are not modelled.
- **Breaks.** Breaks are taken as recorded. Rest-break entitlements are not checked; meal-break timing produces a warning only.
- **Verification.** Rates were transcribed from the official award and cross-checked against its own Schedule B. They have **not** been reviewed by a qualified professional or compared with the Fair Work Pay Calculator.

## Technical

- **Not yet built.** The API, persistence, authentication, UI, CSV import, PDF export, observability and deployment do not exist yet. See the [implementation checklist](implementation-checklist.md).
- **No git on the development machine** at the time of writing. Benchmark records use a source-tree SHA-256 in place of a commit SHA.
- **Ambiguous times.** Shifts that start or end in the repeated DST hour need an explicit UTC offset. The UI does not exist yet to ask for it.
- **Benchmarks.** Synthetic and single-machine; see [performance](performance.md).
