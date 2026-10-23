# Observability

The API emits OpenTelemetry traces and metrics when an OTLP endpoint is configured. It is **off by default**: with no endpoint, the SDK is never loaded. Logs are structured JSON on stdout, and carry trace and span IDs when telemetry is on.

## Turning it on locally

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318 docker compose --profile observability up --build
```

The `observability` profile adds `grafana/otel-lgtm`, a single development container with an OpenTelemetry collector, Tempo (traces), Prometheus (metrics), Loki and Grafana. Grafana is at http://localhost:3003, bound to localhost only, with anonymous access. It is for development only and not a production setup.

Outside Compose, start the API with the preload and point it at any OTLP/HTTP endpoint:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 node --import ./dist/otel.js dist/main.js
```

Standard `OTEL_*` variables apply, such as `OTEL_SERVICE_NAME` (default `wageguard-api`) and `OTEL_SDK_DISABLED=true`. `OTEL_METRIC_EXPORT_INTERVAL` defaults to 15 000 ms.

## What is collected

**Traces** come from automatic instrumentation of HTTP, Express, NestJS and `pg`. Prisma's queries go through the pg adapter, so they appear as SQL spans. There is also one custom span:

| Span                                                                    | Attributes                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wageguard.audit.calculate` (the pure engine: calculate plus reconcile) | `wageguard.shift_count`, `wageguard.calculation_status`, `wageguard.finding_status`, `wageguard.rule_set_version`; on failure, error status with the error type only |

Health and readiness probes are not traced.

**Metrics:**

| Metric                                      | Type                           | Attributes                                                                       |
| ------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `wageguard.audits.created`                  | counter                        | finding status, calculation status, rule-set version                             |
| `wageguard.audit.calculation.duration` (ms) | histogram (0.5–250 ms buckets) | calculation status                                                               |
| `wageguard.reports.exported`                | counter                        | format (`json`, `pdf`)                                                           |
| `wageguard.shift_imports`                   | counter                        | outcome (`imported`, `rejected`; rejected means any error, and nothing is saved) |

Automatic HTTP server metrics (`http.server.request.duration`) are also exported.

## Privacy

Telemetry follows the same rule as the logs: no pay data and no identities.

- **Custom attributes are allow-listed** by type (`SafeAttributes` in `src/infrastructure/telemetry.ts`). They hold codes, counts, versions and formats only. Amounts, names, emails, shift dates and record IDs are never included.
- **A redacting span processor** (`src/infrastructure/telemetry-redaction.ts`) rewrites every span before export:
  - it redacts `client.address`, `network.peer.*` and `user_agent.original`;
  - it removes query strings from `url.query` and `url.full`.
- **What auto-instrumentation never captures:**
  - request and response headers and bodies;
  - database parameter values (`enhancedDatabaseReporting: false`, and Prisma always parameterises).
- **Logs are not exported** through OpenTelemetry; pino only gains `trace_id` and `span_id` fields.

These rules are tested in `apps/api/test/telemetry.test.ts`, with in-memory exporters and a real audit through the HTTP API. One test asserts that no email, amount or record ID appears in any span or metric. Another asserts that the redaction processor rewrites the sensitive attributes.

## Verification record

This was checked by hand on 23 October 2026 against `grafana/otel-lgtm:0.36.0`, first with the API run locally and then with the production API container. These are observations from that session, not continuous monitoring.

- **Traces:**
  - Request traces for every route group reached Tempo (53 in one Playwright journey against the container).
  - An audit-creation trace contained 36 spans: HTTP, Express middleware, the Nest controller, 14 parameterised SQL statements and `wageguard.audit.calculate`.
- **Redaction:** a request with `?limit=2&findingStatus=MATCHED` was stored with `url.query=[REDACTED]`, and with a redacted client address, peer address, port and user agent. A scan of the stored trace found no email, amount, session cookie or password.
- **Metrics:** Prometheus showed `wageguard_audits_created_total` by status, `wageguard_reports_exported_total` by format and `wageguard_shift_imports_total` by outcome.
- **Log correlation:** a `trace_id` copied from an API log line resolved to its trace in Tempo.

## Not in place

- No dashboards, alerts or SLOs are defined.
- No production collector or backend exists, and nothing is deployed.
- The web app (Next.js) is not instrumented.
- The OpenTelemetry JS packages are pinned to the 0.223 / 2.12 line. Newer 0.300 / 3.x releases rename the trace SDK packages, but were under two weeks old when this was built. The upgrade is a follow-up, and the transitive deprecation warnings during install come from that rename.
