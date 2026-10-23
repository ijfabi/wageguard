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

- **Not yet built.** Any cloud deployment, dashboards and alerts, and tracing in the web app.
- **PDF report.**
  - It uses the standard PDF font, so characters outside Windows-1252 in user-entered text appear as "?".
  - It is not tagged for screen readers; the web audit and explanation pages are the accessible version ([ADR 0014](adr/0014-pdf-evidence-report.md)).
- **Web CSP styles.** `style-src` still allows `'unsafe-inline'`: UI libraries set inline style attributes and inject `<style>` elements. Scripts are nonce-only ([ADR 0012](adr/0012-web-frontend-architecture.md)).
- **Every web page renders per request**, which the CSP nonce requires. No page is statically cached.
- **OpenTelemetry packages** are pinned one release line behind the latest (0.223 / 2.12), so `pnpm install` warns about deprecated, renamed transitive packages ([ADR 0013](adr/0013-opt-in-opentelemetry.md)).
- **Web app public holidays** must be entered per audit; DST-ambiguous shift times (the repeated hour) need the API's offset fields, which the shift form does not expose yet. See the [implementation checklist](implementation-checklist.md).
- **API limits.** Registration reveals whether an email is already registered. There is no email verification, password reset or MFA. Rate-limit state is per process (single instance only). See [security](security.md).
- **Idempotency keys** never expire. Audits are processed synchronously ([ADR 0010](adr/0010-audits-idempotency-and-immutability.md)).
- **Early benchmark records** (the engine baseline and first optimised runs, made before the repository existed) carry a source-tree SHA-256 instead of a commit SHA; later records carry both.
- **Ambiguous times.** Shifts that start or end in the repeated DST hour need an explicit UTC offset. The API accepts one (`startUtcOffsetMinutes`, `endUtcOffsetMinutes`), and the UI will need to ask for it.
- **Benchmarks.** Synthetic and single-machine; see [performance](performance.md).
