import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CASUAL_EMPLOYMENT,
  FORTNIGHT,
  NO_CONDITIONS,
  PASSWORD,
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

/** The pay period around Labour Day in NSW (Monday 5 October 2026). */
const OCTOBER = { startDate: "2026-09-28", endDate: "2026-10-11" };

describe("employment profiles (r2 terms)", () => {
  it("stores the state, dates and work conditions, with defaults for the rest", async () => {
    const { agent } = await signedInUser(t);
    const res = await agent
      .post("/api/v1/employments")
      .send({ ...CASUAL_EMPLOYMENT, dateOfBirth: "2000-03-14", employmentStartDate: "2024-02-01" })
      .expect(201);
    expect(res.body).toMatchObject({
      state: "NSW",
      dateOfBirth: "2000-03-14",
      employmentStartDate: "2024-02-01",
      conditions: NO_CONDITIONS,
      allowances: {
        laundersSpecialClothing: false,
        appointedFirstAider: false,
        holdsLiquorLicence: false,
        brokenHill: false,
      },
    });
  });

  it("rejects impossible dates and a start before birth", async () => {
    const { agent } = await signedInUser(t);
    await agent
      .post("/api/v1/employments")
      .send({ ...CASUAL_EMPLOYMENT, dateOfBirth: "2001-02-30" })
      .expect(422);
    await agent
      .post("/api/v1/employments")
      .send({ ...CASUAL_EMPLOYMENT, dateOfBirth: "2010-01-01", employmentStartDate: "2009-01-01" })
      .expect(422);
  });

  it("replaces the terms with PATCH, and only for the owner", async () => {
    const { agent } = await signedInUser(t);
    const id = await createEmployment(agent);
    const updated = await agent
      .patch(`/api/v1/employments/${id}`)
      .send({
        ...CASUAL_EMPLOYMENT,
        label: "Renamed",
        state: "VIC",
        timeZone: "Australia/Melbourne",
        conditions: { ...NO_CONDITIONS, spanException: "NEWSAGENCY" },
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      label: "Renamed",
      state: "VIC",
      conditions: { spanException: "NEWSAGENCY" },
    });

    const other = await signedInUser(t);
    await other.agent
      .patch(`/api/v1/employments/${id}`)
      .send({ ...CASUAL_EMPLOYMENT, label: "Taken over" })
      .expect(404);
  });

  it("keeps a past audit's terms when the profile changes later", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    const payslipId = await createPayslip(agent, employmentId, "139.04");
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "terms-snapshot-01")
      .send({ employmentId, payslipId })
      .expect(201);
    await agent
      .patch(`/api/v1/employments/${employmentId}`)
      .send({ ...CASUAL_EMPLOYMENT, employmentType: "FULL_TIME" })
      .expect(200);
    const report = await agent.get(`/api/v1/audits/${audit.body.id as string}/report`).expect(200);
    expect(report.body.input.employment.employmentType).toBe("CASUAL");
    expect(report.body.audit.findingStatus).toBe("MATCHED");
  });
});

describe("public holidays", () => {
  it("lists a state's holidays without signing in", async () => {
    const res = await t
      .agent()
      .get("/api/v1/public-holidays")
      .query({ state: "NSW", from: "2026-10-01", to: "2026-12-31" })
      .expect(200);
    expect(res.body.holidays.map((h: { date: string; name: string }) => [h.date, h.name])).toEqual([
      ["2026-10-05", "Labour Day"],
      ["2026-12-25", "Christmas Day"],
      ["2026-12-26", "Boxing Day"],
      ["2026-12-28", "Additional public holiday for Boxing Day"],
    ]);
    expect(res.body.coveredYears).toEqual([2026, 2027]);
  });

  it("rejects reversed or overlong ranges", async () => {
    for (const query of [
      { state: "NSW", from: "2026-10-02", to: "2026-10-01" },
      { state: "NSW", from: "2026-01-01", to: "2027-12-31" },
      { state: "XX", from: "2026-01-01", to: "2026-01-02" },
    ]) {
      await t.agent().get("/api/v1/public-holidays").query(query).expect(422);
    }
  });

  it("prices work on a state public holiday from the calendar without the user listing it", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent); // NSW
    await createShift(agent, employmentId, "2026-10-05T09:00", "2026-10-05T13:00");
    // Labour Day: 4h x $69.53 (casual 250%) = $278.12.
    const payslipId = await agent
      .post("/api/v1/payslips")
      .send({ employmentId, payPeriod: OCTOBER, grossPay: "278.12", lines: [] })
      .expect(201)
      .then((r) => (r.body as { id: string }).id);
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "labour-day-0001")
      .send({ employmentId, payslipId })
      .expect(201);
    expect(audit.body).toMatchObject({ findingStatus: "MATCHED", expectedAmount: "278.12" });
    const lines = await agent.get(`/api/v1/audits/${audit.body.id as string}/lines`).expect(200);
    expect(lines.body.lines.map((l: { ruleId: string }) => l.ruleId)).toEqual(["MA000004.PH.ALL_ORDINARY"]);
  });

  it("uses the holidays the request lists instead of the calendar when given", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-10-05T09:00", "2026-10-05T13:00");
    const payslipId = await agent
      .post("/api/v1/payslips")
      .send({ employmentId, payPeriod: OCTOBER, grossPay: "139.04", lines: [] })
      .expect(201)
      .then((r) => (r.body as { id: string }).id);
    // An empty list says no public holiday applied where the work was done: ordinary rate.
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "labour-day-none1")
      .send({ employmentId, payslipId, publicHolidays: [] })
      .expect(201);
    expect(audit.body).toMatchObject({ findingStatus: "MATCHED", expectedAmount: "139.04" });
  });
});

describe("weekly hours across pay periods", () => {
  it("counts the week's earlier shifts from the previous period towards the 38 hours", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    // Mon 29 Jun to Sat 4 Jul: five 7.5-hour days (37.5 h), all in the previous pay period, then
    // Sunday 5 Jul is still the same Monday-to-Sunday week. Its 4 hours: 0.5 h ordinary and 3.5 h
    // overtime, the last hours worked.
    for (const day of ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"]) {
      await createShift(agent, employmentId, `${day}T09:00`, `${day}T17:00`, [
        `${day}T12:00`,
        `${day}T12:30`,
      ]);
    }
    await createShift(agent, employmentId, "2026-07-05T10:00", "2026-07-05T14:00");
    const payslipId = await agent
      .post("/api/v1/payslips")
      .send({
        employmentId,
        payPeriod: { startDate: "2026-07-05", endDate: "2026-07-18" },
        grossPay: "243.34",
        lines: [],
      })
      .expect(201)
      .then((r) => (r.body as { id: string }).id);
    const audit = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "cross-period-001")
      .send({ employmentId, payslipId })
      .expect(201);
    // 0.5 x 48.67 = 24.34 (casual Sunday 175%); 3.5 x 62.57 = 219.00 (Sunday overtime 225%).
    expect(audit.body).toMatchObject({ shiftCount: 1, expectedAmount: "243.34", findingStatus: "MATCHED" });
  });
});

describe("idempotency keys expire", () => {
  it("replays within 24 hours and accepts the key for a new audit afterwards", async () => {
    const { agent, email } = await signedInUser(t);
    // Sessions last 12 hours, so sign in again after each jump forward.
    const signIn = () => agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    const first = await createPayslip(agent, employmentId, "139.04");
    const second = await agent
      .post("/api/v1/payslips")
      .send({ employmentId, payPeriod: FORTNIGHT, grossPay: "100.00", lines: [] })
      .expect(201)
      .then((r) => (r.body as { id: string }).id);

    clock.set("2026-10-22T01:02:03Z");
    const original = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "expiring-key-001")
      .send({ employmentId, payslipId: first })
      .expect(201);
    clock.set("2026-10-23T01:02:02Z");
    await signIn();
    await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "expiring-key-001")
      .send({ employmentId, payslipId: second })
      .expect(422);
    clock.set("2026-10-23T01:02:03Z");
    const reused = await agent
      .post("/api/v1/audits")
      .set("Idempotency-Key", "expiring-key-001")
      .send({ employmentId, payslipId: second })
      .expect(201);
    expect(reused.body.id).not.toBe(original.body.id);
    expect(reused.body.findingStatus).toBe("POTENTIAL_UNDERPAYMENT");
    clock.set("2026-10-22T01:02:03Z");
  });
});
