import { SpanStatusCode, metrics, trace, type Meter } from "@opentelemetry/api";

/**
 * Application-level telemetry (custom spans and metrics). Calls go through the OpenTelemetry API,
 * which is a no-op unless the SDK was started by `src/otel.ts`.
 *
 * Privacy rule: attributes are limited to {@link SafeAttributes}: status codes, counts, versions
 * and formats. Never amounts, names, emails, dates of shifts or record ids.
 */
// A type alias (not an interface) so it is assignable to the API's indexed Attributes type.
export type SafeAttributes = {
  readonly "wageguard.finding_status"?: string;
  readonly "wageguard.calculation_status"?: string;
  readonly "wageguard.rule_set_version"?: string;
  readonly "wageguard.shift_count"?: number;
  readonly "wageguard.replayed"?: boolean;
  readonly "wageguard.report_format"?: "json" | "pdf";
  readonly "wageguard.outcome"?: "imported" | "rejected";
};

const SCOPE = "wageguard-api";

function createInstruments(meter: Meter) {
  return {
    auditsCreated: meter.createCounter("wageguard.audits.created", {
      description: "Audits created, by finding and calculation status",
      unit: "{audit}",
    }),
    calculationDuration: meter.createHistogram("wageguard.audit.calculation.duration", {
      description: "Time to calculate and reconcile one pay period (engine only, no I/O)",
      unit: "ms",
      advice: { explicitBucketBoundaries: [0.5, 1, 2.5, 5, 10, 25, 50, 100, 250] },
    }),
    reportsExported: meter.createCounter("wageguard.reports.exported", {
      description: "Evidence reports downloaded, by format",
      unit: "{report}",
    }),
    shiftImports: meter.createCounter("wageguard.shift_imports", {
      description: "CSV shift imports, by outcome (rejected = any error, nothing is saved)",
      unit: "{import}",
    }),
  };
}

// Instruments are bound to whichever meter provider is global when first used, and re-created if
// it changes (tests install an in-memory provider after modules load).
let cached: { meter: Meter; instruments: ReturnType<typeof createInstruments> } | undefined;
function instruments(): ReturnType<typeof createInstruments> {
  const meter = metrics.getMeter(SCOPE);
  if (cached?.meter !== meter) {
    cached = { meter, instruments: createInstruments(meter) };
  }
  return cached.instruments;
}

export const telemetry = {
  /** Runs the pure calculation inside a span and records its duration. */
  measureCalculation<T>(
    attributes: SafeAttributes,
    run: () => T,
    describe: (result: T) => SafeAttributes,
  ): T {
    return trace.getTracer(SCOPE).startActiveSpan("wageguard.audit.calculate", { attributes }, (span) => {
      const started = performance.now();
      try {
        const result = run();
        const outcome = { ...attributes, ...describe(result) };
        span.setAttributes(outcome);
        instruments().calculationDuration.record(performance.now() - started, {
          "wageguard.calculation_status": outcome["wageguard.calculation_status"],
        });
        return result;
      } catch (error: unknown) {
        // The message may quote input, so only the error type is recorded.
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.name : "Error",
        });
        throw error;
      } finally {
        span.end();
      }
    });
  },

  auditCreated(attributes: SafeAttributes): void {
    instruments().auditsCreated.add(1, { ...attributes });
  },

  reportExported(format: "json" | "pdf"): void {
    instruments().reportsExported.add(1, { "wageguard.report_format": format });
  },

  shiftImport(outcome: "imported" | "rejected"): void {
    instruments().shiftImports.add(1, { "wageguard.outcome": outcome });
  },
};
