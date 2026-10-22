import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROUTES } from "../src/openapi/openapi.js";
import { ORIGIN, startApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

describe("operations endpoints", () => {
  it("reports liveness and readiness", async () => {
    await t.agent().get("/api/v1/health").expect(200, { status: "ok" });
    await t.agent().get("/api/v1/ready").expect(200, { status: "ready" });
  });

  it("lists the published rule sets without authentication", async () => {
    const res = await t.agent().get("/api/v1/rules/versions").expect(200);
    expect(res.body).toMatchObject({ items: [{ version: "MA000004/2026-07-01/r1", awardCode: "MA000004" }] });
  });
});

describe("OpenAPI document", () => {
  it("is served and describes every route", async () => {
    const res = await t.agent().get("/api/v1/openapi.json").expect(200);
    const doc = res.body as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/api/v1/audits"]?.["post"]).toBeDefined();
  });

  it("matches the routes Nest actually registered (no undocumented or phantom routes)", () => {
    const router = (
      t.app.getHttpAdapter().getInstance() as unknown as {
        router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
      }
    ).router;
    const registered = router.stack
      .filter((layer) => layer.route !== undefined)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map((method) => `${method.toUpperCase()} ${layer.route!.path}`),
      )
      // Nest registers a catch-all under the global prefix to produce 404s for unknown routes.
      .filter((route) => !route.includes("*splat"))
      .sort();
    const documented = ROUTES.map((r) => `${r.method.toUpperCase()} /api/v1${r.path}`).sort();
    expect(registered).toEqual(documented);
  });
});

describe("cross-cutting HTTP behaviour", () => {
  it("sets security headers and hides the framework", async () => {
    const res = await t.agent().get("/api/v1/health").expect(200);
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("propagates a well-formed correlation id and replaces a malformed one", async () => {
    const good = await t.agent().get("/api/v1/health").set("x-correlation-id", "abc12345-test").expect(200);
    expect(good.headers["x-correlation-id"]).toBe("abc12345-test");
    const bad = await t
      .agent()
      .get("/api/v1/health")
      .set("x-correlation-id", "<script> forged id; spaces")
      .expect(200);
    expect(bad.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the documented error body for unknown routes and unauthenticated access", async () => {
    const missing = await t.agent().get("/api/v1/nope").expect(404);
    expect(missing.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found", correlationId: expect.any(String) },
    });
    const unauth = await t.agent().get("/api/v1/audits").expect(401);
    expect(unauth.body.error.code).toBe("UNAUTHENTICATED");
    expect(unauth.body.error.correlationId).toBe(unauth.headers["x-correlation-id"]);
  });

  it("rejects state-changing requests from foreign origins or cross-site contexts (CSRF defence in depth)", async () => {
    const body = { email: "x@example.test", password: "irrelevant-password" };
    const foreign = await t
      .agent()
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send(body)
      .expect(403);
    expect(foreign.body.error.code).toBe("FORBIDDEN_ORIGIN");
    await t.agent().post("/api/v1/auth/login").set("Sec-Fetch-Site", "cross-site").send(body).expect(403);
    await t.agent().post("/api/v1/auth/login").set("Origin", ORIGIN).send(body).expect(401);
  });

  it("rejects malformed and oversized JSON with the documented error body", async () => {
    const malformed = await t
      .agent()
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":')
      .expect(400);
    expect(malformed.body.error.code).toBe("VALIDATION_FAILED");
    const huge = await t
      .agent()
      .post("/api/v1/auth/login")
      .send({ email: "a@example.test", password: "x".repeat(600 * 1024) })
      .expect(413);
    expect(huge.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("rate limiting", () => {
  it("limits credential endpoints per client", async () => {
    const limited = await startApp({ AUTH_RATE_LIMIT_PER_MINUTE: "3" });
    try {
      const attempt = () =>
        limited
          .agent()
          .post("/api/v1/auth/login")
          .send({ email: "nobody@example.test", password: "wrong-password!" });
      for (let i = 0; i < 3; i += 1) {
        expect((await attempt()).status).toBe(401);
      }
      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMITED");
      // Other routes are governed by the general limit only.
      await limited.agent().get("/api/v1/rules/versions").expect(200);
    } finally {
      await limited.close();
    }
  });
});
