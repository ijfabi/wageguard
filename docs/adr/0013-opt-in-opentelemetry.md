# ADR 0013: Optional OpenTelemetry that can't leak private data

- Status: Accepted
- Date: 2026-10-23

## Context

Traces and metrics make it possible to see where time goes and how audits behave: how many there are, what they found, and how long the engine takes. But the API handles pay data and personal details, and its logs already leave out request bodies, credentials, client addresses and query strings. Telemetry mustn't become a back door around those rules.

## Decision

OpenTelemetry is loaded before the application with `node --import ./dist/otel.js dist/main.js`. The preload registers the ESM loader hook, which is needed because the Prisma adapter imports `pg` as an ES module. If `OTEL_EXPORTER_OTLP_ENDPOINT` isn't set, the preload does nothing at all, so there's no cost and no dependency on a collector.

Traces and metrics go out over OTLP/HTTP, so any compatible backend can receive them. Logs stay as JSON on standard output, with the trace and span IDs added so you can move between the two. Exporting logs through OpenTelemetry as well would duplicate a pipeline that already works.

The standard instrumentation covers HTTP, Express, NestJS and `pg`. On top of that there's one custom span around the pure calculation, counters for audits, report downloads and CSV imports, and a histogram of calculation time.

Privacy is built into the code paths rather than left to discipline:

- Custom attributes can only be set through a type that lists the allowed names (`SafeAttributes`).
- A span processor rewrites every span before export, whichever instrumentation produced it, blanking client details and query strings.
- Capturing SQL parameter values stays switched off.

The application only talks to `@opentelemetry/api`, which does nothing when no SDK has been started. Metric instruments are created on first use, so tests can plug in in-memory exporters.

## Alternatives considered

A commercial APM agent would bring vendor lock-in and cost, and would capture more by default, not less. Custom spans alone would miss HTTP and database timing. Redacting through per-request hooks only covers the HTTP instrumentation, while the span processor covers everything.

## Consequences

The OpenTelemetry packages are pinned to the 0.223 and 2.12 releases. The newer line renames the trace SDK packages and was less than two weeks old at the time, so upgrading is a follow-up.

The preload uses `module.register`, which `@types/node` marks as deprecated. OpenTelemetry's hook doesn't support the newer `registerHooks` yet, and the lint suppression on that line says so.

The privacy rules and the custom signals have automated tests. The end-to-end check against a real collector was done by hand and is written up in [observability](../observability.md).
