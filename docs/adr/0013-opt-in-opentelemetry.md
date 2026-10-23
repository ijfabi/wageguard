# ADR 0013: Opt-in OpenTelemetry with privacy by construction

- Status: Accepted
- Date: 2026-10-23

## Context

The API needs traces and metrics to diagnose latency and to see how audits behave: how many are created and with which outcomes, and how long the engine takes. At the same time it handles pay data and identities, and its logs already exclude bodies, credentials, client addresses and query strings. Telemetry must not become a side channel that undoes that.

## Decision

- **OpenTelemetry, preloaded and opt-in.**
  - `node --import ./dist/otel.js dist/main.js`. The preload registers the ESM loader hook, needed because `pg` is imported from ESM by the Prisma adapter.
  - It starts the SDK only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
  - Otherwise it loads nothing, so there is no runtime cost or dependency on a collector.
- **Vendor-neutral export** over OTLP/HTTP for traces and metrics.
  - Logs stay on stdout as JSON, with trace and span IDs injected for correlation.
  - Exporting logs through OpenTelemetry would duplicate a pipeline that already works.
- **Automatic instrumentation** for HTTP, Express, NestJS and `pg`, plus a small custom surface:
  - one span around the pure calculation;
  - counters for audits, report exports and CSV imports;
  - a calculation-duration histogram.
- **Privacy by construction:**
  - custom attributes use an allow-list type (`SafeAttributes`);
  - a redacting span processor rewrites client identity and query strings on every span before export, whichever instrumentation produced it;
  - database parameter capture stays off.
- **Telemetry calls go through `@opentelemetry/api`**, which is a no-op without the SDK. Instruments are created lazily so tests can install in-memory providers.

## Alternatives considered

- **A vendor SDK (APM agent).** Rejected because of lock-in and cost, and because it would capture more by default.
- **Manual spans only.** Rejected: database and HTTP timing would be missing.
- **Request hooks to redact.** Rejected because they cover only the HTTP instrumentation. The span processor covers every source.

## Consequences

- **Pinned versions.** Packages are pinned to OpenTelemetry JS 0.223 / 2.12. The newer line, released less than two weeks earlier, renames the trace SDK packages. Upgrading is a tracked follow-up.
- **`module.register` is used.** `@types/node` marks it deprecated, but OpenTelemetry's hook does not yet support `registerHooks`. The lint suppression on that line is justified there.
- **Verification so far.** The end-to-end check against a collector was done by hand (see [observability](../observability.md)). The privacy rules and custom signals are covered by automated tests.
