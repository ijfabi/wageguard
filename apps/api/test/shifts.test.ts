import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEmployment, createShift, signedInUser, startApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

const CSV_HEADER = "start,end,meal_start,meal_end";

describe("shift recording", () => {
  it("stores wall-clock times and resolved UTC instants with breaks", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const res = await agent
      .post("/api/v1/shifts")
      .send({
        employmentId,
        start: "2026-07-06T09:00",
        end: "2026-07-06T17:00",
        breaks: [{ kind: "UNPAID_MEAL", start: "2026-07-06T12:00", end: "2026-07-06T12:30" }],
      })
      .expect(201);
    expect(res.body).toMatchObject({
      start: "2026-07-06T09:00",
      end: "2026-07-06T17:00",
      startAt: "2026-07-05T23:00:00.000Z",
      endAt: "2026-07-06T07:00:00.000Z",
      breaks: [{ kind: "UNPAID_MEAL", start: "2026-07-06T12:00", end: "2026-07-06T12:30" }],
      version: 1,
    });
  });

  it("rejects overlapping shifts (database exclusion constraint) but allows back-to-back shifts", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    await createShift(agent, employmentId, "2026-07-06T13:00", "2026-07-06T17:00");
    const overlap = await agent
      .post("/api/v1/shifts")
      .send({ employmentId, start: "2026-07-06T12:00", end: "2026-07-06T14:00", breaks: [] })
      .expect(409);
    expect(overlap.body.error.code).toBe("SHIFT_OVERLAP");
  });

  it("allows the same times on two different employments", async () => {
    const { agent } = await signedInUser(t);
    const a = await createEmployment(agent);
    const b = await createEmployment(agent);
    await createShift(agent, a, "2026-07-06T09:00", "2026-07-06T13:00");
    await createShift(agent, b, "2026-07-06T09:00", "2026-07-06T13:00");
  });
});

describe("optimistic concurrency", () => {
  it("applies an update with the current version and rejects a stale one", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const shift = await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    const update = { start: "2026-07-06T10:00", end: "2026-07-06T14:00", breaks: [] };
    const first = await agent
      .patch(`/api/v1/shifts/${shift.id}`)
      .send({ ...update, version: 1 })
      .expect(200);
    expect(first.body).toMatchObject({ version: 2, start: "2026-07-06T10:00" });
    const stale = await agent
      .patch(`/api/v1/shifts/${shift.id}`)
      .send({ ...update, version: 1 })
      .expect(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("lets exactly one of two concurrent updates with the same version win", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const shift = await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    const responses = await Promise.all(
      ["10:00", "11:00"].map((time) =>
        agent
          .patch(`/api/v1/shifts/${shift.id}`)
          .send({ version: 1, start: `2026-07-06T${time}`, end: "2026-07-06T15:00", breaks: [] }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(stored.version).toBe(2);
  });

  it("does not allow moving a shift to another employment", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const other = await createEmployment(agent);
    const shift = await createShift(agent, employmentId, "2026-07-06T09:00", "2026-07-06T13:00");
    await agent
      .patch(`/api/v1/shifts/${shift.id}`)
      .send({
        version: 1,
        employmentId: other,
        start: "2026-07-06T09:00",
        end: "2026-07-06T13:00",
        breaks: [],
      })
      .expect(422);
  });
});

describe("listing", () => {
  it("paginates with opaque cursors, filters by date and supports both sort orders", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    for (const day of ["06", "07", "08", "09", "10"]) {
      await createShift(agent, employmentId, `2026-07-${day}T09:00`, `2026-07-${day}T13:00`);
    }
    const page1 = await agent.get(`/api/v1/shifts?employmentId=${employmentId}&limit=2`).expect(200);
    expect(page1.body.items.map((s: { start: string }) => s.start.slice(8, 10))).toEqual(["06", "07"]);
    const page2 = await agent
      .get(`/api/v1/shifts?employmentId=${employmentId}&limit=2&cursor=${page1.body.nextCursor}`)
      .expect(200);
    expect(page2.body.items.map((s: { start: string }) => s.start.slice(8, 10))).toEqual(["08", "09"]);
    const page3 = await agent
      .get(`/api/v1/shifts?employmentId=${employmentId}&limit=2&cursor=${page2.body.nextCursor}`)
      .expect(200);
    expect(page3.body).toMatchObject({ nextCursor: null });
    expect(page3.body.items).toHaveLength(1);

    const desc = await agent
      .get(`/api/v1/shifts?employmentId=${employmentId}&sort=start_desc&limit=1`)
      .expect(200);
    expect(desc.body.items[0].start).toBe("2026-07-10T09:00");
    const filtered = await agent
      .get(`/api/v1/shifts?employmentId=${employmentId}&from=2026-07-07&to=2026-07-08`)
      .expect(200);
    expect(filtered.body.items).toHaveLength(2);
  });
});

describe("CSV import", () => {
  const importCsv = (
    agent: ReturnType<TestApp["agent"]>,
    employmentId: string,
    csv: string,
    type = "text/csv",
  ) => agent.post(`/api/v1/shifts/import?employmentId=${employmentId}`).set("Content-Type", type).send(csv);

  it("imports valid rows atomically and records an event", async () => {
    const { agent, id } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const csv = `${CSV_HEADER}\n2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30\n2026-07-07T09:00,2026-07-07T13:00,,\n`;
    const res = await importCsv(agent, employmentId, csv).expect(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.shifts[0].breaks).toHaveLength(1);
    expect(await t.prisma.auditEvent.count({ where: { userId: id, type: "SHIFTS_IMPORTED" } })).toBe(1);
  });

  it.each([
    ["wrong header", "begin,finish\n2026-07-06T09:00,2026-07-06T13:00\n", "INVALID_CSV_HEADER"],
    ["no rows", `${CSV_HEADER}\n`, "EMPTY_CSV"],
    ["bad value", `${CSV_HEADER}\n2026-07-06 09:00,2026-07-06T13:00,,\n`, "INVALID_CSV_VALUE"],
    ["formula injection", `${CSV_HEADER}\n=CMD|' /C calc'!A0,2026-07-06T13:00,,\n`, "INVALID_CSV_VALUE"],
    [
      "quoted formula",
      `${CSV_HEADER}\n"=HYPERLINK(""http://evil"")",2026-07-06T13:00,,\n`,
      "INVALID_CSV_VALUE",
    ],
    ["column count", `${CSV_HEADER}\n2026-07-06T09:00,2026-07-06T13:00\n`, "MALFORMED_CSV"],
    ["unbalanced quote", `${CSV_HEADER}\n"2026-07-06T09:00,2026-07-06T13:00,,\n`, "MALFORMED_CSV"],
    [
      "half a meal break",
      `${CSV_HEADER}\n2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,\n`,
      "INVALID_CSV_VALUE",
    ],
    ["domain error", `${CSV_HEADER}\n2026-07-06T13:00,2026-07-06T09:00,,\n`, "INVALID_INTERVAL"],
    [
      "overlapping rows",
      `${CSV_HEADER}\n2026-07-06T09:00,2026-07-06T13:00,,\n2026-07-06T12:00,2026-07-06T15:00,,\n`,
      "OVERLAPPING_SHIFTS",
    ],
  ])("rejects %s with 422 and imports nothing", async (_name, csv, code) => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const res = await importCsv(agent, employmentId, csv).expect(422);
    expect(res.body.error.issues.map((i: { code: string }) => i.code)).toContain(code);
    expect(await t.prisma.shift.count({ where: { employmentId } })).toBe(0);
  });

  it("names the failing line", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const csv = `${CSV_HEADER}\n2026-07-06T09:00,2026-07-06T13:00,,\n2026-07-07T09:00,bad,,\n`;
    const res = await importCsv(agent, employmentId, csv).expect(422);
    expect(res.body.error.issues[0].path).toBe("line 3.end");
  });

  it("rolls back the whole file when a row overlaps an existing shift", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    await createShift(agent, employmentId, "2026-07-07T09:00", "2026-07-07T13:00");
    const csv = `${CSV_HEADER}\n2026-07-06T09:00,2026-07-06T13:00,,\n2026-07-07T10:00,2026-07-07T12:00,,\n`;
    await importCsv(agent, employmentId, csv).expect(409);
    expect(await t.prisma.shift.count({ where: { employmentId } })).toBe(1);
  });

  it("rejects oversized files, too many rows and the wrong content type", async () => {
    const { agent } = await signedInUser(t);
    const employmentId = await createEmployment(agent);
    const huge = `${CSV_HEADER}\n${"x".repeat(300 * 1024)}`;
    expect((await importCsv(agent, employmentId, huge).expect(413)).body.error.code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
    const rows = Array.from({ length: 501 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 6, 6) + i * 86_400_000).toISOString().slice(0, 10);
      return `${day}T09:00,${day}T13:00,,`;
    });
    const tooMany = await importCsv(agent, employmentId, `${CSV_HEADER}\n${rows.join("\n")}\n`).expect(422);
    expect(tooMany.body.error.issues[0].code).toBe("TOO_MANY_ROWS");
    const wrongType = await agent
      .post(`/api/v1/shifts/import?employmentId=${employmentId}`)
      .send({ csv: "start,end" })
      .expect(415);
    expect(wrongType.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});
