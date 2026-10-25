import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  NO_CONDITIONS,
  createEmployment,
  createPayslip,
  createShift,
  fixedClock,
  signedInUser,
  startApp,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  // The clock only drives the history window; audit created_at comes from the database.
  t = await startApp({}, { clock: fixedClock(new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) });
});
afterAll(async () => {
  await t.close();
});

describe("GET /payslips", () => {
  it("lists only the user's payslips, newest first, filterable by employment", async () => {
    const { agent } = await signedInUser(t);
    const a = await createEmployment(agent);
    const b = await createEmployment(agent);
    const first = await createPayslip(agent, a, "10.00");
    const second = await createPayslip(agent, b, "20.00");
    const all = await agent.get("/api/v1/payslips").expect(200);
    expect(all.body.items.map((p: { id: string }) => p.id)).toEqual([second, first]);
    const filtered = await agent.get(`/api/v1/payslips?employmentId=${a}`).expect(200);
    expect(filtered.body.items.map((p: { id: string }) => p.id)).toEqual([first]);
    const other = await signedInUser(t);
    expect((await other.agent.get("/api/v1/payslips").expect(200)).body.items).toEqual([]);
  });
});

describe("GET /dashboard", () => {
  it("returns zeros and an empty 12-month history for a new user", async () => {
    const { agent } = await signedInUser(t);
    const res = await agent.get("/api/v1/dashboard").expect(200);
    expect(res.body.totals).toMatchObject({
      audits: 0,
      shiftsAnalysed: 0,
      needsAttention: 0,
      potentialUnderpaymentAmount: "0.00",
    });
    expect(res.body.history).toHaveLength(12);
    expect(res.body.history.every((h: { total: number }) => h.total === 0)).toBe(true);
    expect(res.body.recentAudits).toEqual([]);
  });

  it("aggregates the user's audits only", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00"); // 4h x 34.76 = 139.04
    const matched = await createPayslip(agent, employmentId, "139.04");
    const under = await createPayslip(agent, employmentId, "100.00");
    const fullTime = await createEmployment(agent, { conditions: { ...NO_CONDITIONS, apprentice: true } });
    await createShift(agent, fullTime, "2026-07-06T09:00", "2026-07-06T13:00");
    const unsupported = await createPayslip(agent, fullTime, "100.00");
    for (const [key, employment, payslip] of [
      ["dash-key-0001", employmentId, matched],
      ["dash-key-0002", employmentId, under],
      ["dash-key-0003", fullTime, unsupported],
    ] as const) {
      await agent
        .post("/api/v1/audits")
        .set("Idempotency-Key", key)
        .send({ employmentId: employment, payslipId: payslip })
        .expect(201);
    }
    // Another user's audit must not be counted.
    const other = await signedInUser(t);
    const otherEmployment = await createEmployment(other.agent);
    const otherSlip = await createPayslip(other.agent, otherEmployment, "1.00");
    await other.agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "dash-key-other")
      .send({ employmentId: otherEmployment, payslipId: otherSlip })
      .expect(201);

    const res = await agent.get("/api/v1/dashboard").expect(200);
    expect(res.body.totals).toMatchObject({
      audits: 3,
      shiftsAnalysed: 3,
      needsAttention: 1,
      potentialUnderpaymentAmount: "-39.04",
      byFindingStatus: { MATCHED: 1, POTENTIAL_UNDERPAYMENT: 1, UNSUPPORTED_SCENARIO: 1, REVIEW_REQUIRED: 0 },
    });
    expect(res.body.processing).toEqual({ completed: 3 });
    expect(res.body.recentAudits).toHaveLength(3);
    const thisMonth = res.body.history.at(-1);
    expect(thisMonth).toMatchObject({ total: 3, byFindingStatus: { MATCHED: 1, POTENTIAL_UNDERPAYMENT: 1 } });
  });
});
