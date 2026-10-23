import { bundledRegistry } from "@wageguard/award-rules";
import { calculatePayPeriod } from "@wageguard/calculation-engine";
import { Instant } from "@wageguard/domain";
import { extractText } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FORTNIGHT,
  createEmployment,
  createPayslip,
  createShift,
  fixedClock,
  signedInUser,
  startApp,
  type TestApp,
} from "./helpers.js";

const clock = fixedClock("2026-10-22T01:02:03Z");
let t: TestApp;
beforeAll(async () => {
  t = await startApp({}, { clock });
});
afterAll(async () => {
  await t.close();
});

/** Golden scenario G009: Monday, Saturday and Sunday casual shifts = $862.15 award minimum. */
async function g009(agent: Awaited<ReturnType<typeof signedInUser>>["agent"], grossPay = "862.15") {
  const employmentId = await createEmployment(agent);
  await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T17:00", [
    "2026-07-06T12:00",
    "2026-07-06T12:30",
  ]);
  await createShift(agent, employmentId, "2026-07-11T08:00", "2026-07-11T16:30", [
    "2026-07-11T12:00",
    "2026-07-11T12:30",
  ]);
  await createShift(agent, employmentId, "2026-07-12T10:00", "2026-07-12T16:00", [
    "2026-07-12T13:00",
    "2026-07-12T13:30",
  ]);
  const payslipId = await createPayslip(agent, employmentId, grossPay);
  return { employmentId, payslipId };
}

describe("audit workflow", () => {
  it("calculates, reconciles and stores a MATCHED audit with full metadata", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const res = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "g009-matched-01")
      .send({ employmentId, payslipId })
      .expect(201);
    expect(res.body).toMatchObject({
      status: "COMPLETED",
      findingStatus: "MATCHED",
      calculationStatus: "CALCULATED",
      payPeriod: FORTNIGHT,
      expectedAmount: "862.15",
      reportedAmount: "862.15",
      difference: "0.00",
      shiftCount: 3,
      ruleSetVersion: "MA000004/2026-07-01/r1",
      engineVersion: "0.1.0",
      calculatedAt: "2026-10-22T01:02:03.000Z",
      comparisonBasis: "GROSS_PAY",
    });
    expect(res.body.ruleSetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.findings[0]).toMatchObject({ status: "MATCHED", expectedAmount: "862.15" });
  });

  it("reports a potential underpayment with the difference and evidence", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent, "800.00");
    const res = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "g009-under-0001")
      .send({ employmentId, payslipId })
      .expect(201);
    expect(res.body).toMatchObject({ findingStatus: "POTENTIAL_UNDERPAYMENT", difference: "-62.15" });
    expect(res.body.findings[0].evidenceRefs).toContain("/lines");
  });

  it("never shows MATCHED for scenarios WageGuard cannot verify", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent, { employmentType: "FULL_TIME" });
    await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    const payslipId = await createPayslip(agent, employmentId, "100.00");
    const res = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "unsupported-001")
      .send({ employmentId, payslipId })
      .expect(201);
    expect(res.body).toMatchObject({
      findingStatus: "UNSUPPORTED_SCENARIO",
      expectedAmount: null,
      difference: null,
    });
  });

  it("exposes pay lines, a shift breakdown and a downloadable report", async () => {
    const { agent, id: userId } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const created = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "g009-report-001")
      .send({ employmentId, payslipId })
      .expect(201);
    const auditId = created.body.id as string;

    const lines = await agent.get(`/api/v1/audits/${auditId}/lines`).expect(200);
    expect(lines.body.lines.map((l: { ruleId: string; amount: string }) => [l.ruleId, l.amount])).toEqual([
      ["MA000004.ORD.WEEKDAY", "260.70"],
      ["MA000004.PEN.SATURDAY", "333.76"],
      ["MA000004.PEN.SUNDAY", "267.69"],
    ]);
    expect(lines.body.shifts).toHaveLength(3);

    const report = await agent.get(`/api/v1/audits/${auditId}/report`).expect(200);
    expect(report.headers["content-disposition"]).toBe(
      `attachment; filename="wageguard-audit-${auditId}.json"`,
    );
    expect(report.body).toMatchObject({
      reportVersion: 1,
      audit: { id: auditId },
      disclaimer: expect.stringMatching(/not legal advice/),
    });
    expect(report.body.calculation.trace).toHaveLength(8);
    expect(await t.prisma.auditEvent.count({ where: { userId, type: "REPORT_EXPORTED" } })).toBe(1);
  });

  it("renders the evidence report as a PDF from the stored snapshot", async () => {
    const { agent, id: userId } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent, "800.00");
    const created = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "g009-report-pdf1")
      .send({ employmentId, payslipId })
      .expect(201);
    const auditId = created.body.id as string;

    const fetchPdf = () => agent.get(`/api/v1/audits/${auditId}/report/pdf`).responseType("blob").expect(200);
    const res = await fetchPdf();
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="wageguard-audit-${auditId}.pdf"`);
    expect(res.headers["cache-control"]).toBe("no-store");
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    for (const expected of [
      "WageGuard audit report",
      "Potential underpayment",
      "Mon 6 Jul 2026",
      "$800.00", // reported
      "$862.15", // calculated minimum
      "-$62.15", // difference
      "$333.76", // Saturday pay line
      created.body.ruleSetFingerprint as string,
      created.body.inputHash as string,
      "not legal advice",
    ]) {
      expect(text, expected).toContain(expected);
    }
    // Same snapshot, same document text: the report never re-runs the calculation.
    const again = await extractText(new Uint8Array((await fetchPdf()).body as Buffer), { mergePages: true });
    expect(again.text).toBe(text);
    expect(
      await t.prisma.auditEvent.count({
        where: { userId, type: "REPORT_EXPORTED", metadata: { path: ["format"], equals: "pdf" } },
      }),
    ).toBe(2);
  });

  it("words partial and unsupported PDF reports without overstating them", async () => {
    const { agent } = await signedInUser(t);
    const pages = async (key: string, employmentId: string, payslipId: string) => {
      const created = await agent
        .post("/api/v1/audits")
        .set("Idempotency-Key", key)
        .send({ employmentId, payslipId })
        .expect(201);
      const pdf = await agent
        .get(`/api/v1/audits/${created.body.id as string}/report/pdf`)
        .responseType("blob")
        .expect(200);
      return (await extractText(new Uint8Array(pdf.body as Buffer), { mergePages: true })).text;
    };

    // Partial: Friday evening work runs past 9 pm, outside the span of ordinary hours.
    const casual = await createEmployment(agent);
    await createShift(agent, casual, "2026-07-06T09:00", "2026-07-06T17:00", [
      "2026-07-06T12:00",
      "2026-07-06T12:30",
    ]);
    await createShift(agent, casual, "2026-07-10T17:00", "2026-07-10T22:00");
    const partial = await pages("pdf-partial-0001", casual, await createPayslip(agent, casual, "450.00"));
    for (const expected of [
      "Needs review",
      "Difference vs checked shifts",
      "+$189.30",
      "Not a verified overpayment",
      "Work outside ordinary hours",
      "Not priced",
    ]) {
      expect(partial, expected).toContain(expected);
    }
    expect(partial).not.toContain("OUTSIDE_SPAN_OF_ORDINARY_HOURS");

    // Unsupported: full-time employment is outside the supported scope, so nothing is priced.
    const fullTime = await createEmployment(agent, { employmentType: "FULL_TIME" });
    await createShift(agent, fullTime, "2026-07-06T09:00", "2026-07-06T13:00");
    const unsupported = await pages(
      "pdf-unsupported1",
      fullTime,
      await createPayslip(agent, fullTime, "100.00"),
    );
    for (const expected of ["Not calculated", "No shifts could be priced, so there are no pay lines.", "—"]) {
      expect(unsupported, expected).toContain(expected);
    }
    expect(unsupported).not.toMatch(/Matches calculated minimum|underpayment/i);
  });

  it("continues long PDF tables across pages with a repeated header and numbered footers", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    // Two 3-hour shifts on every weekday of the fortnight: 20 shift rows.
    for (const day of ["06", "07", "08", "09", "10", "13", "14", "15", "16", "17"]) {
      await createShift(agent, employmentId, `2026-07-${day}T07:00`, `2026-07-${day}T10:00`);
      await createShift(agent, employmentId, `2026-07-${day}T13:00`, `2026-07-${day}T16:00`);
    }
    const payslipId = await createPayslip(agent, employmentId, "2085.60");
    const created = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "pdf-long-report1")
      .send({ employmentId, payslipId })
      .expect(201);
    const pdf = await agent
      .get(`/api/v1/audits/${created.body.id as string}/report/pdf`)
      .responseType("blob")
      .expect(200);
    const { totalPages, text } = await extractText(new Uint8Array(pdf.body as Buffer));

    expect(totalPages).toBeGreaterThanOrEqual(2);
    text.forEach((page, index) => {
      expect(page).toContain(`page ${index + 1} of ${totalPages}`);
    });
    expect(text.join("\n")).toContain("Fri 17 Jul 2026, 1:00 pm – 4:00 pm");
    // The shifts table header appears on every page the table spans.
    const withShiftRows = text.filter((page) => /Jul 2026, \d+:00 (am|pm) – /.test(page));
    expect(withShiftRows.length).toBeGreaterThanOrEqual(2);
    for (const page of withShiftRows) {
      expect(page).toMatch(/Shift\s+Paid\s+Unpaid/);
    }
  });

  it("rejects a payslip from a different employment", async () => {
    const { agent } = await signedInUser(t);
    const a = await createEmployment(agent);
    const b = await createEmployment(agent);
    const payslipId = await createPayslip(agent, b, "10.00");
    const res = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "mismatch-00001")
      .send({ employmentId: a, payslipId })
      .expect(422);
    expect(res.body.error.issues[0].code).toBe("PAYSLIP_EMPLOYMENT_MISMATCH");
  });

  it("lists audits newest first with filtering and pagination", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const under = await createPayslip(agent, employmentId, "1.00");
    for (const [key, slip] of [
      ["list-key-0001", payslipId],
      ["list-key-0002", under],
      ["list-key-0003", payslipId],
    ] as const) {
      clock.set(`2026-10-22T0${key.at(-1)}:00:00Z`);
      await agent
        .post("/api/v1/audits")
        .set("Idempotency-Key", key)
        .send({ employmentId, payslipId: slip })
        .expect(201);
    }
    const page = await agent.get("/api/v1/audits?limit=2").expect(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.nextCursor).not.toBeNull();
    const rest = await agent.get(`/api/v1/audits?limit=2&cursor=${page.body.nextCursor}`).expect(200);
    expect(rest.body.items).toHaveLength(1);
    const underpaid = await agent.get("/api/v1/audits?findingStatus=POTENTIAL_UNDERPAYMENT").expect(200);
    expect(underpaid.body.items).toHaveLength(1);
  });
});

describe("idempotency", () => {
  it("requires a well-formed Idempotency-Key", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const missing = await agent.post("/api/v1/audits").send({ employmentId, payslipId }).expect(400);
    expect(missing.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "short")
      .send({ employmentId, payslipId })
      .expect(422);
    await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "has spaces in it")
      .send({ employmentId, payslipId })
      .expect(422);
  });

  it("replays the stored audit for a repeated key and request", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const first = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "replay-key-0001")
      .send({ employmentId, payslipId })
      .expect(201);
    const second = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "replay-key-0001")
      .send({ employmentId, payslipId })
      .expect(200);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body).toEqual(first.body);
    expect(await t.prisma.audit.count({ where: { employmentId } })).toBe(1);
  });

  it("rejects reuse of a key for a different request", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "reuse-key-00001")
      .send({ employmentId, payslipId })
      .expect(201);
    const res = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "reuse-key-00001")
      .send({ employmentId, payslipId, declaredPublicHolidays: ["2026-07-06"] })
      .expect(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("persists exactly one audit under 10 concurrent identical requests", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        agent
          .post("/api/v1/audits")
          .set("Idempotency-Key", "concurrent-key-01")
          .send({ employmentId, payslipId }),
      ),
    );
    expect(responses.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(responses.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(new Set(responses.map((r) => r.body.id as string)).size).toBe(1);
    expect(await t.prisma.audit.count({ where: { employmentId } })).toBe(1);
  });
});

describe("immutable, reproducible snapshots", () => {
  it("is unaffected by later edits to shifts and payslips' source data", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const shift = await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    const payslipId = await createPayslip(agent, employmentId, "139.04");
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "snapshot-key-01")
      .send({ employmentId, payslipId })
      .expect(201);
    await agent
      .patch(`/api/v1/shifts/${shift.id}`)
      .send({ version: 1, start: "2026-07-06T09:00", end: "2026-07-06T17:00", breaks: [] })
      .expect(200);
    const after = await agent.get(`/api/v1/audits/${audit.body.id}`).expect(200);
    expect(after.body).toEqual(audit.body);
  });

  it("refuses UPDATE and DELETE of completed audits and their findings at the database level", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "immutable-key-01")
      .send({ employmentId, payslipId })
      .expect(201);
    const id = audit.body.id as string;
    await expect(t.prisma.audit.update({ where: { id }, data: { reportedAmount: "0.00" } })).rejects.toThrow(
      /immutable/,
    );
    await expect(t.prisma.audit.delete({ where: { id } })).rejects.toThrow(/immutable/);
    await expect(
      t.prisma.auditFinding.updateMany({ where: { auditId: id }, data: { explanation: "tampered" } }),
    ).rejects.toThrow(/immutable/);
    await expect(t.prisma.employment.delete({ where: { id: employmentId } })).rejects.toThrow();
  });

  it("reproduces the stored result exactly from the stored input snapshot", async () => {
    const { agent } = await signedInUser(t);
    const { employmentId, payslipId } = await g009(agent);
    const created = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "reproduce-key-01")
      .send({ employmentId, payslipId })
      .expect(201);
    const row = await t.prisma.audit.findUniqueOrThrow({ where: { id: created.body.id } });
    const recomputed = calculatePayPeriod(row.inputSnapshot, {
      rules: bundledRegistry(),
      calculatedAt: Instant.ofEpochMs(row.calculatedAt.getTime()),
    });
    expect(JSON.parse(JSON.stringify(recomputed))).toEqual(row.result);
    expect(recomputed.metadata.inputHash).toBe(row.inputHash);
  });
});
