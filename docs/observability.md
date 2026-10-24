# Observability

The API can send OpenTelemetry traces and metrics to any OTLP collector. It's off unless you configure an endpoint. Without one, none of the OpenTelemetry code is even loaded. Logs are always JSON on standard output, and when telemetry is on, each line also carries the trace and span IDs so you can jump from a log line to its trace.

## Trying it locally

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318 docker compose --profile observability up --build
```

The `observability` profile adds `grafana/otel-lgtm`, a single container that bundles a collector with Tempo for traces, Prometheus for metrics, Loki and Grafana. Grafana opens at http://localhost:3003 without a login and only listens on localhost. It's a development convenience, not a production setup.

Outside Docker Compose, start the API with the preload and point it at any OTLP/HTTP endpoint:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 node --import ./dist/otel.js dist/main.js
```

The usual `OTEL_*` variables work, including `OTEL_SERVICE_NAME` (defaults to `wageguard-api`) and `OTEL_SDK_DISABLED=true`. Metrics are exported every 15 seconds unless `OTEL_METRIC_EXPORT_INTERVAL` says otherwise.

## What gets collected

Traces come from the standard instrumentation for HTTP, Express, NestJS and the `pg` driver. Prisma goes through `pg`, so every database query shows up as its own span. There's one custom span, `wageguard.audit.calculate`, around the pure calculation and reconciliation. It records the number of shifts, the calculation and finding statuses, and the rule-set version. If the calculation throws, the span is marked as an error with only the error's type. The message could contain input, so it isn't recorded. Health and readiness checks aren't traced, because they'd drown everything else out.

The custom metrics are:

| Metric                                      | Type                             | Broken down by                                                                     |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| `wageguard.audits.created`                  | counter                          | finding status, calculation status, rule-set version                               |
| `wageguard.audit.calculation.duration` (ms) | histogram, 0.5 to 250 ms buckets | calculation status                                                                 |
| `wageguard.reports.exported`                | counter                          | format (`json` or `pdf`)                                                           |
| `wageguard.shift_imports`                   | counter                          | outcome (`imported`, or `rejected` for any error, in which case nothing was saved) |

The standard `http.server.request.duration` metric is exported as well.

## Keeping private data out

Telemetry follows the same rule as the logs: no pay data and no information about who someone is.

Custom attributes can only be set through a type that allows a fixed list of names (`SafeAttributes` in `src/infrastructure/telemetry.ts`). Those names cover status codes, counts, versions and formats. Amounts, names, emails, shift dates and record IDs aren't on the list.

Before anything is exported, a span processor (`src/infrastructure/telemetry-redaction.ts`) rewrites every span, whichever instrumentation produced it. It blanks the client address, peer address and port, and the user agent, and strips query strings from URLs. The standard instrumentation is configured so it never records request or response headers, bodies, or SQL parameter values. Prisma always sends parameterised queries, so values don't appear in the SQL text either. Logs aren't exported through OpenTelemetry at all.

`apps/api/test/telemetry.test.ts` runs a real audit through the API with in-memory exporters attached. It checks that no email, amount or record ID shows up in any span or metric, and that the redaction processor rewrites the sensitive attributes.

## Manual check

On 23 October 2026 the whole pipeline was checked by hand against `grafana/otel-lgtm:0.36.0`, first with the API running directly and then with the production container. These are observations from that session, not ongoing monitoring.

One Playwright run against the container produced 53 traces in Tempo, covering every group of routes. A single audit-creation trace had 36 spans: the HTTP request, the Express middleware, the Nest controller, 14 parameterised SQL statements and the calculation span.

A request sent with `?limit=2&findingStatus=MATCHED` was stored with its query blanked out, along with the client address, peer address, port and user agent. A search of the stored trace found no email, amount, session cookie or password. Prometheus showed the audit, report and import counters broken down as expected. A `trace_id` copied out of an API log line opened the right trace in Tempo.

## Not set up yet

- No dashboards, alerts or service-level objectives.
- No production collector, since nothing is deployed.
- No tracing in the web app.
- The OpenTelemetry packages are pinned to the 0.223 and 2.12 releases. The next line (0.300 and 3.x) renames the trace SDK packages, and it was less than two weeks old when this was built, so upgrading is a follow-up. The rename is also why `pnpm install` warns about some deprecated packages.
