import { randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixedClock, startApp, type TestApp } from "./helpers.js";

/**
 * The PostgreSQL rate-limit store. Two app instances stand in for two API containers behind a load
 * balancer: they share one budget per client. Each test uses its own client address (via a trusted
 * X-Forwarded-For) so parallel test files never share a counter.
 */
const clock = fixedClock("2026-10-22T00:00:00Z");
let a: TestApp;
let b: TestApp;
beforeAll(async () => {
  const env = { RATE_LIMIT_STORE: "postgres", AUTH_RATE_LIMIT_PER_MINUTE: "3", TRUST_PROXY: "1" };
  [a, b] = await Promise.all([startApp(env, { clock }), startApp(env, { clock })]);
});
afterAll(async () => {
  await Promise.all([a.close(), b.close()]);
});

const clientAddress = () => `198.51.100.${randomInt(1, 255)}, 10.0.${randomInt(0, 255)}.${randomInt(1, 255)}`;
const attempt = (app: TestApp, from: string) =>
  app
    .agent()
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", from)
    .send({ email: "nobody@example.test", password: "wrong-password!" });

describe("shared rate limits", () => {
  it("counts a client's requests across instances", async () => {
    const from = clientAddress();
    expect((await attempt(a, from)).status).toBe(401);
    expect((await attempt(b, from)).status).toBe(401);
    expect((await attempt(a, from)).status).toBe(401);
    const blocked = await attempt(b, from);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("starts a new window once the minute is up", async () => {
    clock.set("2026-10-22T01:00:00Z");
    const from = clientAddress();
    for (let i = 0; i < 3; i += 1) {
      await attempt(a, from);
    }
    expect((await attempt(b, from)).status).toBe(429);
    clock.set("2026-10-22T01:01:01Z");
    expect((await attempt(b, from)).status).toBe(401);
  });

  it("keeps one row per client and throttler, holding only a hash of the client", async () => {
    const from = clientAddress();
    await attempt(a, from);
    const rows = await a.prisma.rateLimitBucket.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(from.split(",")[0]);
  });
});
