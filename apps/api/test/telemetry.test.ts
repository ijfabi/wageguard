import { SpanStatusCode, metrics, trace } from "@opentelemetry/api";
import { MetricReader, MeterProvider, type DataPoint, type Histogram } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REDACTED, RedactingSpanProcessor } from "../src/infrastructure/telemetry-redaction.js";
import { telemetry } from "../src/infrastructure/telemetry.js";
import {
  createEmployment,
  createPayslip,
  createShift,
  fixedClock,
  signedInUser,
  startApp,
  type TestApp,
} from "./helpers.js";

/** Collects metrics on demand. */
class TestReader extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const spans = new InMemorySpanExporter();
const reader = new TestReader();
let t: TestApp;

beforeAll(async () => {
  trace.setGlobalTracerProvider(
    new TracerProvider({
      spanProcessors: [new RedactingSpanProcessor(), new SimpleSpanProcessor({ exporter: spans })],
    }),
  );
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
  t = await startApp({}, { clock: fixedClock("2026-10-22T01:02:03Z") });
});
afterAll(async () => {
  await t.close();
  trace.disable();
  metrics.disable();
});

async function points(name: string): Promise<DataPoint<number | Histogram>[]> {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((s) => s.metrics)
    .filter((m) => m.descriptor.name === name)
    .flatMap((m) => m.dataPoints as DataPoint<number | Histogram>[]);
}

describe("application telemetry", () => {
  it("traces the calculation and counts audits and reports, without pay data or identities", async () => {
    const { agent, email } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T17:00", [
      "2026-07-06T12:00",
      "2026-07-06T12:30",
    ]);
    const payslipId = await createPayslip(agent, employmentId, "260.70");
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "telemetry-audit-01")
      .send({ employmentId, payslipId })
      .expect(201);
    await agent.get(`/api/v1/audits/${audit.body.id as string}/report/pdf`).expect(200);

    const calculate = spans.getFinishedSpans().filter((s) => s.name === "wageguard.audit.calculate");
    expect(calculate).toHaveLength(1);
    expect(calculate[0]?.attributes).toEqual({
      "wageguard.shift_count": 1,
      "wageguard.calculation_status": "CALCULATED",
      "wageguard.finding_status": "MATCHED",
      "wageguard.rule_set_version": "MA000004/2026-07-01/r2",
    });

    expect(await points("wageguard.audits.created")).toEqual([
      expect.objectContaining({
        value: 1,
        attributes: {
          "wageguard.finding_status": "MATCHED",
          "wageguard.calculation_status": "CALCULATED",
          "wageguard.rule_set_version": "MA000004/2026-07-01/r2",
        },
      }),
    ]);
    const [duration] = await points("wageguard.audit.calculation.duration");
    expect((duration?.value as Histogram).count).toBe(1);
    expect(await points("wageguard.reports.exported")).toEqual([
      expect.objectContaining({ value: 1, attributes: { "wageguard.report_format": "pdf" } }),
    ]);

    // Nothing sensitive in any recorded attribute.
    const recorded = JSON.stringify([
      spans.getFinishedSpans().map((s) => s.attributes),
      (await reader.collect()).resourceMetrics,
    ]);
    for (const secret of [email, "260.70", employmentId, payslipId, audit.body.id as string]) {
      expect(recorded, secret).not.toContain(secret);
    }
  });

  it("marks a failed calculation as an error, recording only the error type", () => {
    expect(() =>
      telemetry.measureCalculation(
        { "wageguard.shift_count": 2 },
        () => {
          throw new RangeError("input 2026-07-06T09:00 paid 862.15");
        },
        () => ({}),
      ),
    ).toThrow(RangeError);
    const failed = spans.getFinishedSpans().at(-1);
    expect(failed?.name).toBe("wageguard.audit.calculate");
    expect(failed?.status).toEqual({ code: SpanStatusCode.ERROR, message: "RangeError" });
    expect(JSON.stringify([failed?.attributes, failed?.events])).not.toMatch(/862\.15|2026-07-06/);
  });

  it("counts rejected CSV imports", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await agent
      .post(`/api/v1/shifts/import?employmentId=${employmentId}`)
      .set("Content-Type", "text/csv")
      .send("not,a,shift,file\n")
      .expect(422);
    expect(await points("wageguard.shift_imports")).toEqual([
      expect.objectContaining({ value: 1, attributes: { "wageguard.outcome": "rejected" } }),
    ]);
  });
});

describe("RedactingSpanProcessor", () => {
  it("redacts client identity and query strings and leaves everything else alone", () => {
    const exporter = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [new RedactingSpanProcessor(), new SimpleSpanProcessor({ exporter })],
    });
    const tracer = provider.getTracer("test");
    tracer
      .startSpan("GET /api/v1/shifts", {
        attributes: {
          "client.address": "203.0.113.7",
          "network.peer.address": "203.0.113.7",
          "network.peer.port": 51_234,
          "user_agent.original": "Mozilla/5.0",
          "url.full": "http://localhost:3001/api/v1/shifts?employmentId=abc&from=2026-07-01",
          "url.query": "employmentId=abc&from=2026-07-01",
          "url.path": "/api/v1/shifts",
          "http.request.method": "GET",
        },
      })
      .end();
    tracer.startSpan("pg.query:SELECT", { attributes: { "db.query.text": "SELECT 1 WHERE id = $1" } }).end();

    const [http, db] = exporter.getFinishedSpans();
    expect(http?.attributes).toEqual({
      "client.address": REDACTED,
      "network.peer.address": REDACTED,
      "network.peer.port": REDACTED,
      "user_agent.original": REDACTED,
      "url.full": "http://localhost:3001/api/v1/shifts",
      "url.query": REDACTED,
      "url.path": "/api/v1/shifts",
      "http.request.method": "GET",
    });
    expect(db?.attributes).toEqual({ "db.query.text": "SELECT 1 WHERE id = $1" });
  });
});
