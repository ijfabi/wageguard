# Known limitations

WageGuard is an information tool. It isn't legal advice, and it doesn't decide whether the award covers you. You tell it that.

## What it calculates

Only one slice of one award is supported: the General Retail Industry Award 2020 (MA000004), Retail Employee Level 1, adults on casual or part-time contracts who aren't shiftworkers, in pay periods starting on or after 1 July 2026. Anything else comes back as "not supported".

Some situations are detected and flagged but never priced: overtime, public holidays, minimum-engagement top-ups, the payment for less than 12 hours between work days (cl. 16.6), and the span-of-hours exceptions in cl. 15.2 (newsagencies, video shops, and extended trading to 11 pm). When one of these applies, the affected hours are left out of the total and the audit is marked "needs review".

Other things are out of scope entirely: allowances, leave and leave loading, junior and apprentice rates, shiftwork, rostered days off, time off instead of overtime, and enterprise agreements.

A few simplifications are worth knowing about:

- **Public holidays.** A day only counts as a public holiday if you say so when you run the audit. There's no built-in calendar.
- **Daily and weekly hour checks.** These only see shifts in the same pay period, so a week that spans two pay periods is only partly checked.
- **Part-time guaranteed hours.** These are one number per weekday. Written temporary changes (cl. 10.6) and agreed start and finish times (cl. 10.5(b)) aren't modelled.
- **Breaks.** These are taken exactly as recorded. Rest-break entitlements aren't checked, and meal-break timing only produces a warning.

The rates were copied from the official award and checked against the award's own Schedule B. Nobody with payroll or legal qualifications has reviewed them, and they haven't been compared with the Fair Work Pay Calculator.

## Product

- Shifts that start or end in the repeated hour when daylight saving ends need an explicit UTC offset. The API accepts one, but the shift form in the web app doesn't ask for it yet.
- The homepage animations and accessibility panel have only been tested in Chromium, and no screen reader or keyboard-only pass of the whole app has been recorded ([ACCESSIBILITY.md](../ACCESSIBILITY.md)).
- The PDF report uses the standard PDF font, so characters outside the Western European set show up as "?". The PDF isn't tagged for screen readers either. The audit and explanation pages in the web app are the accessible version ([ADR 0014](adr/0014-pdf-evidence-report.md)).
- There's no email verification, password reset or two-factor sign-in. Registration also reveals whether an email address is already in use. See [security](security.md).

## Technical

- **Rate limits.** Rate-limit counters live in the API process, so they're only correct with a single instance.
- **Idempotency keys** never expire.
- **Web content security policy.** Scripts are locked down with a per-request nonce, but styles still allow inline values, because the UI libraries set inline styles at runtime ([ADR 0012](adr/0012-web-frontend-architecture.md)). The nonce also means every page is rendered per request, so nothing is served from a static cache.
- **OpenTelemetry versions.** The OpenTelemetry packages are pinned one release line behind the latest, which is why `pnpm install` warns about some renamed packages ([ADR 0013](adr/0013-opt-in-opentelemetry.md)).
- **Dashboard cost.** The dashboard still adds up all of a user's audits on every request. It's index-only now, so it grows slowly, but it does grow ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).
- **Index rollout.** The Phase 5 index migration uses a plain `CREATE INDEX`. On a large existing database, build the indexes concurrently first ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).
- **Cloud deployments.** The Terraform in `infra/aws` and `infra/azure` is validated but has never been applied, so nothing about it is tested against a real cloud ([infrastructure](infrastructure.md)).
- **Rate limits on Azure.** In the Azure design, API traffic arrives through the platform ingress and the web app's proxy. `TRUST_PROXY` is left at its default until the number of hops can be measured on a real deployment, so until then every visitor would share one rate-limit budget.
- **Not built yet.** Monitoring dashboards and alerts, tracing in the web app, and backups copied to another region.
- **Benchmark scope.** All benchmarks are synthetic and ran on one laptop ([performance](performance.md)). The earliest engine records predate the git repository and are identified by a source-tree hash instead of a commit.
