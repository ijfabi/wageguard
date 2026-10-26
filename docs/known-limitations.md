# Known limitations

WageGuard is an information tool. It isn't legal advice, and it doesn't decide whether the award covers you. You tell it that.

## What it calculates

Only one award is supported: the General Retail Industry Award 2020 (MA000004), for pay periods starting on or after 1 July 2026. Within it, rule set `MA000004/2026-07-01/r2` prices Retail Employee Levels 1 to 8 on full-time, part-time and casual contracts, adult and junior rates, ordinary and penalty hours, overtime, public holidays, minimum engagement top-ups, the payment for less than 12 hours between work days (cl. 16.6), the span-of-hours exceptions in cl. 15.2, shiftwork, the allowances in cl. 19 and paid leave with annual leave loading. Anything outside that comes back as "not supported" or "needs review" instead of a figure.

These are still out of scope:

- apprentices, trainees and the supported wage system (cl. 17.3 to 17.7);
- baking production shiftwork (cl. 24.2 and 25.2);
- higher duties, recall and travelling time (cl. 17.5, 19.11, 19.5), and reimbursements that depend on actual costs;
- time off instead of overtime (cl. 21.3) and substitute days for public holidays (cl. 22.2). Overtime and public holiday work are paid at their rates, with a note that an agreement may change how a payslip shows them;
- enterprise agreements, which replace the award entirely.

A few simplifications are worth knowing about:

- **Averaging rosters.** When hours average 38 a week over a longer cycle (cl. 15.6(g)), a week over 38 hours is held for review rather than paid as overtime, because the rest of the cycle isn't known.
- **Weekly hours.** Shifts from the 13 days before a pay period count towards that week's 38 hours and the 12-hour break, but only if you recorded them.
- **Overtime order.** When hours go over a daily or weekly limit, the last hours worked are treated as the overtime.
- **Annual leave loading** is shown at the 17.5% minimum. The award pays the higher of that and the penalty rates you'd have earned, and WageGuard doesn't work out the second.
- **Breaks.** These are taken exactly as recorded. Missing paid rest breaks only produce a note, because rest breaks are paid time anyway.

The rates were copied from the official award, and a test reproduces every rate in its Schedule B tables. Nobody with payroll or legal qualifications has reviewed them, and they haven't been compared with the Fair Work Pay Calculator.

## Public holidays

The holiday calendar covers 2026 and 2027, copied from the Fair Work Ombudsman's lists on 25 October 2026 ([award sources](award-sources.md)). Pay periods in other years need their holidays added by hand, and the audit form says so. Holidays that only apply in parts of a state, such as Melbourne Cup Day in some regional areas, are listed but start unticked. Leaving a holiday out can only lower the calculated minimum, so it never produces a false underpayment.

## Product

- Account emails need an SMTP provider in production. Locally, Mailpit catches them. There's no way yet to change the email address on an account.
- Two-step sign-in uses authenticator app codes (TOTP) only. Passkeys and security keys aren't supported.
- Sign-up answers the same way for new and existing addresses, and the email goes out after the reply, but the two paths still do slightly different database work, so their response times aren't identical.
- The PDF report embeds DejaVu Sans, which covers Latin, Greek, Cyrillic, Hebrew and several other scripts. Characters it doesn't have, such as Chinese, Japanese or emoji, still show as "?", and right-to-left text isn't reordered. The PDF isn't tagged for screen readers either. The audit and explanation pages in the web app are the accessible version ([ADR 0014](adr/0014-pdf-evidence-report.md)).
- The homepage animations and accessibility panel have only been tested in Chromium, and no screen reader or keyboard-only pass of the whole app has been recorded ([ACCESSIBILITY.md](../ACCESSIBILITY.md)).

## Technical

- **Rate limits** are shared through PostgreSQL, so they hold across API instances, at the cost of one small write per request. The API load benchmark in the README was recorded before this change and hasn't been repeated yet.
- **Web content security policy.** Scripts are locked down with a per-request nonce, but styles still allow inline values, because the UI libraries set inline styles at runtime ([ADR 0012](adr/0012-web-frontend-architecture.md)). The nonce also means every page is rendered per request, so nothing is served from a static cache.
- **OpenTelemetry versions.** The OpenTelemetry packages are pinned one release line behind the latest, which is why `pnpm install` warns about some renamed packages ([ADR 0013](adr/0013-opt-in-opentelemetry.md)).
- **Dashboard cost.** The dashboard still adds up all of a user's audits on every request. It's index-only now, so it grows slowly, but it does grow ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).
- **Index rollout.** The Phase 5 index migration uses a plain `CREATE INDEX`. On a large existing database, build the indexes concurrently first ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).
- **Cloud deployments.** The Terraform in `infra/aws` and `infra/azure` is validated but has never been applied, so nothing about it is tested against a real cloud ([infrastructure](infrastructure.md)).
- **Client addresses on Azure.** API traffic arrives through the platform ingress and the web app's proxy. `TRUST_PROXY` is left at its default until the number of hops can be measured on a real deployment, so until then every visitor would share one rate-limit budget.
- **Not built yet.** Monitoring dashboards and alerts, tracing in the web app, and backups copied to another region.
- **Benchmark scope.** All benchmarks are synthetic and ran on one laptop ([performance](performance.md)). The earliest engine records predate the git repository and are identified by a source-tree hash instead of a commit.
