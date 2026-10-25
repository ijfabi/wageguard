import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FORTNIGHT,
  PASSWORD,
  createEmployment,
  createPayslip,
  createShift,
  signedInUser,
  startApp,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

/** Alice owns data; Mallory is another signed-in user trying to reach it. */
async function aliceAndMallory() {
  const alice = await signedInUser(t);
  const mallory = await signedInUser(t);
  const employmentId = await createEmployment(alice.agent);
  const shift = await createShift(alice.agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
  const payslipId = await createPayslip(alice.agent, employmentId, "139.04");
  const audit = await alice.agent
    .post("/api/v1/audits")
    .set("Idempotency-Key", "alice-audit-0001")
    .send({ employmentId, payslipId })
    .expect(201);
  return {
    alice,
    mallory,
    employmentId,
    shiftId: shift.id,
    payslipId,
    auditId: (audit.body as { id: string }).id,
  };
}

describe("broken object-level authorisation (BOLA)", () => {
  it("returns 404, never another user's data, for every object-level read", async () => {
    const { mallory, employmentId, shiftId, payslipId, auditId } = await aliceAndMallory();
    for (const path of [
      `/api/v1/employments/${employmentId}`,
      `/api/v1/shifts/${shiftId}`,
      `/api/v1/payslips/${payslipId}`,
      `/api/v1/audits/${auditId}`,
      `/api/v1/audits/${auditId}/lines`,
      `/api/v1/audits/${auditId}/report`,
      `/api/v1/audits/${auditId}/report/pdf`,
    ]) {
      const res = await mallory.agent.get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code, path).toBe("NOT_FOUND");
      expect(JSON.stringify(res.body), path).not.toContain("Casual retail job");
    }
  });

  it("does not leak other users' rows through list endpoints or filters", async () => {
    const { mallory, employmentId } = await aliceAndMallory();
    for (const path of [
      "/api/v1/employments",
      "/api/v1/audits",
      `/api/v1/shifts?employmentId=${employmentId}`,
    ]) {
      const res = await mallory.agent.get(path).expect(200);
      expect(res.body.items, path).toEqual([]);
    }
  });

  it("refuses to write into another user's employment, shift or payslip", async () => {
    const { mallory, employmentId, shiftId, payslipId } = await aliceAndMallory();
    await mallory.agent
      .post("/api/v1/shifts")
      .send({ employmentId, start: "2026-07-07T09:00", end: "2026-07-07T13:00", breaks: [] })
      .expect(404);
    await mallory.agent
      .patch(`/api/v1/shifts/${shiftId}`)
      .send({ version: 1, start: "2026-07-06T09:00", end: "2026-07-06T10:00", breaks: [] })
      .expect(404);
    await mallory.agent
      .post("/api/v1/payslips")
      .send({ employmentId, payPeriod: FORTNIGHT, grossPay: "1.00", lines: [] })
      .expect(404);
    await mallory.agent
      .post(`/api/v1/shifts/import?employmentId=${employmentId}`)
      .set("Content-Type", "text/csv")
      .send("start,end,meal_start,meal_end\n2026-07-08T09:00,2026-07-08T13:00,,\n")
      .expect(404);
    const malloryEmployment = await createEmployment(mallory.agent);
    await mallory.agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "mallory-audit-01")
      .send({ employmentId: malloryEmployment, payslipId })
      .expect(404);
  });

  it("treats the same idempotency key from different users as different requests", async () => {
    const { mallory, payslipId } = await aliceAndMallory();
    const malloryEmployment = await createEmployment(mallory.agent);
    const mallorySlip = await createPayslip(mallory.agent, malloryEmployment, "0.00");
    const res = await mallory.agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "alice-audit-0001")
      .send({ employmentId: malloryEmployment, payslipId: mallorySlip })
      .expect(201);
    expect(res.body.payslipId).not.toBe(payslipId);
  });
});

describe("database-level ownership guarantees", () => {
  it("refuses to attach a shift to another user's employment even if the application is bypassed", async () => {
    const { mallory, employmentId } = await aliceAndMallory();
    await expect(
      t.prisma.shift.create({
        data: {
          userId: mallory.id,
          employmentId,
          startLocal: "2026-07-08T09:00",
          endLocal: "2026-07-08T13:00",
          startDate: new Date("2026-07-08T00:00:00Z"),
          startAt: new Date("2026-07-07T23:00:00Z"),
          endAt: new Date("2026-07-08T03:00:00Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("never lets ownership change, so shifts cannot be silently reassigned", async () => {
    const { mallory, employmentId, shiftId } = await aliceAndMallory();
    await expect(
      t.prisma.employment.update({ where: { id: employmentId }, data: { userId: mallory.id } }),
    ).rejects.toThrow(/ownership/);
    const malloryEmployment = await createEmployment(mallory.agent);
    await expect(
      t.prisma.shift.update({ where: { id: shiftId }, data: { employmentId: malloryEmployment } }),
    ).rejects.toThrow();
  });
});

describe("injection and hostile input", () => {
  it("stores SQL and script payloads as inert text", async () => {
    const { agent } = await signedInUser(t);
    const label = `'); DROP TABLE users; -- <script>alert(1)</script>`;
    const res = await agent
      .post("/api/v1/employments")
      .send({ ...baseEmployment(), label })
      .expect(201);
    expect(res.body.label).toBe(label);
    expect(await t.prisma.user.count()).toBeGreaterThan(0);
  });

  it("rejects injection attempts in identifiers, sort keys, filters and cursors", async () => {
    const { agent } = await signedInUser(t);
    await agent.get("/api/v1/employments/1%20OR%201=1").expect(422);
    await agent.get("/api/v1/shifts?sort=startAt;DROP%20TABLE%20shifts").expect(422);
    await agent.get("/api/v1/shifts?from=2026-07-01'%20OR%20'1'='1").expect(422);
    await agent.get("/api/v1/audits?cursor=eyJrIjoiJyBPUiAxPTEgLS0iLCJpZCI6IngifQ").expect(422);
    await agent.get("/api/v1/audits?limit=100000").expect(422);
  });

  it("rejects invalid dates and DST-impossible times with domain issue codes", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const invalid = await agent
      .post("/api/v1/shifts")
      .send({ employmentId, start: "2026-02-30T09:00", end: "2026-02-30T12:00", breaks: [] })
      .expect(422);
    expect(invalid.body.error.issues.map((i: { code: string }) => i.code)).toContain("INVALID_LOCAL_DATE");
    const gap = await agent
      .post("/api/v1/shifts")
      .send({ employmentId, start: "2026-10-04T02:30", end: "2026-10-04T06:00", breaks: [] })
      .expect(422);
    expect(gap.body.error.issues[0].code).toBe("NONEXISTENT_LOCAL_TIME");
    const tz = await agent
      .post("/api/v1/employments")
      .send({ ...baseEmployment(), timeZone: "AEST" })
      .expect(422);
    expect(tz.body.error.issues[0].code).toBe("INVALID_TIME_ZONE");
  });
});

describe("account deletion", () => {
  it("requires the password, then deletes every owned row including immutable audits", async () => {
    const { alice, auditId } = await aliceAndMallory();
    await alice.agent.delete("/api/v1/auth/me").send({ password: "wrong-password-xyz" }).expect(401);
    await alice.agent.delete("/api/v1/auth/me").send({ password: PASSWORD }).expect(204);
    await alice.agent.get("/api/v1/auth/me").expect(401);
    expect(await t.prisma.user.count({ where: { id: alice.id } })).toBe(0);
    expect(await t.prisma.audit.count({ where: { id: auditId } })).toBe(0);
    expect(await t.prisma.employment.count({ where: { userId: alice.id } })).toBe(0);
    expect(await t.prisma.session.count({ where: { userId: alice.id } })).toBe(0);
    expect(
      await t.prisma.auditEvent.count({ where: { type: "ACCOUNT_DELETED", userId: null } }),
    ).toBeGreaterThan(0);
  });
});

function baseEmployment() {
  return {
    label: "Job",
    awardCode: "MA000004",
    classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
    employmentType: "CASUAL",
    state: "NSW",
    timeZone: "Australia/Sydney",
    declarations: {
      awardCoverage: "CONFIRMED",
      enterpriseAgreement: "NONE",
      ageBand: "ADULT_21_PLUS",
      shiftworker: "NO",
    },
  };
}
