/**
 * OpenTelemetry SDK bootstrap. Preload it before the application so modules are instrumented as
 * they are imported:
 *
 *   node --import ./dist/otel.js dist/main.js
 *
 * It does nothing (and loads no SDK code) unless OTEL_EXPORTER_OTLP_ENDPOINT is set and
 * OTEL_SDK_DISABLED is not "true". Standard OTEL_* variables configure the exporters.
 *
 * Privacy (matching the request logs): a redacting span processor removes client addresses, user
 * agents and URL query strings from every span; headers and bodies are never captured; database
 * spans carry parameterised SQL only (Prisma never inlines values; parameter capture stays off).
 * Logs are not exported through OpenTelemetry; pino keeps writing redacted JSON to stdout, now
 * with trace ids.
 */
import { register } from "node:module";

const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "";
const enabled = endpoint !== "" && process.env["OTEL_SDK_DISABLED"] !== "true";

if (enabled) {
  // ESM imports (for example pg, loaded by the Prisma adapter) need the loader hook. OpenTelemetry
  // 0.2xx ships it for module.register() only; registerHooks() support is tracked upstream.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- required by the OpenTelemetry hook
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
  // Stable HTTP conventions keep the path and query in separate attributes (the old http.target
  // combined them), so the redacting processor can drop the query.
  process.env["OTEL_SEMCONV_STABILITY_OPT_IN"] ??= "http";

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { BatchSpanProcessor },
    { RedactingSpanProcessor },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { NestInstrumentation },
    { PgInstrumentation },
    { PinoInstrumentation },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-metrics-otlp-http"),
    import("@opentelemetry/sdk-metrics"),
    import("@opentelemetry/sdk-trace"),
    import("./infrastructure/telemetry-redaction.js"),
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-express"),
    import("@opentelemetry/instrumentation-nestjs-core"),
    import("@opentelemetry/instrumentation-pg"),
    import("@opentelemetry/instrumentation-pino"),
  ]);

  const exportIntervalMillis = Number(process.env["OTEL_METRIC_EXPORT_INTERVAL"] ?? 15_000);
  const sdk = new NodeSDK({
    serviceName: process.env["OTEL_SERVICE_NAME"] ?? "wageguard-api",
    // Redaction runs first, in onEnding, before the batch processor hands spans to the exporter.
    spanProcessors: [
      new RedactingSpanProcessor(),
      new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        // Health probes would otherwise dominate the traces.
        ignoreIncomingRequestHook: (req) => /^\/api\/v1\/(health|ready)\b/.test(req.url ?? ""),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      // Trace ids are added to log lines; log records themselves are not exported.
      new PinoInstrumentation({ disableLogSending: true }),
    ],
  });
  sdk.start();

  // Flush buffered spans and metrics on shutdown. A SIGTERM listener replaces Node's default
  // exit, so the process exits explicitly once the SDK has shut down (or after 5 s).
  process.once("SIGTERM", () => {
    const timeout = setTimeout(() => process.exit(0), 5_000);
    timeout.unref();
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
