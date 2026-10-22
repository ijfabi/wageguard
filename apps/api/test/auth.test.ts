import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PASSWORD, fixedClock, signedInUser, startApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

const sessionCookie = (headers: Record<string, unknown>): string => {
  const cookies = headers["set-cookie"] as string[] | undefined;
  return cookies?.find((c) => c.startsWith("wg_session=")) ?? "";
};

describe("registration", () => {
  it("creates the user, normalises the email and sets an HttpOnly SameSite=Strict session cookie", async () => {
    const email = `New.User-${randomUUID()}@Example.TEST`;
    const res = await t.agent().post("/api/v1/auth/register").send({ email, password: PASSWORD }).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: email.toLowerCase(),
      createdAt: expect.any(String),
    });
    const cookie = sessionCookie(res.headers);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
  });

  it("stores an argon2id hash, never the password", async () => {
    const { id } = await signedInUser(t);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id } });
    // PHC string format: $argon2id$v=19$m=19456,p=1,t=2$<salt>$<hash>
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    const params = user.passwordHash.split("$")[3]!.split(",").sort();
    expect(params).toEqual(["m=19456", "p=1", "t=2"]);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("stores only the SHA-256 of session tokens", async () => {
    const agent = t.agent();
    const email = `token-${randomUUID()}@example.test`;
    const res = await agent.post("/api/v1/auth/register").send({ email, password: PASSWORD }).expect(201);
    const token = sessionCookie(res.headers).split(";")[0]!.split("=")[1]!;
    const sessions = await t.prisma.session.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[0]!.tokenHash).not.toBe(token);
  });

  it("rejects duplicate emails, short passwords, malformed emails and unknown fields", async () => {
    const { email } = await signedInUser(t);
    const dup = await t.agent().post("/api/v1/auth/register").send({ email, password: PASSWORD }).expect(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
    const short = await t
      .agent()
      .post("/api/v1/auth/register")
      .send({ email: "a@example.test", password: "short" })
      .expect(422);
    expect(short.body.error.issues[0]).toMatchObject({ path: "password" });
    await t
      .agent()
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: PASSWORD })
      .expect(422);
    await t
      .agent()
      .post("/api/v1/auth/register")
      .send({ email: "b@example.test", password: PASSWORD, isAdmin: true })
      .expect(422);
  });
});

describe("sessions", () => {
  it("logs in, identifies the user, and logs out (revoking the session server-side)", async () => {
    const { email } = await signedInUser(t);
    const agent = t.agent();
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    await agent.get("/api/v1/auth/me").expect(200);
    await agent.post("/api/v1/auth/logout").expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
  });

  it("revokes the session row so a stolen cookie stops working after logout", async () => {
    const agent = t.agent();
    const email = `steal-${randomUUID()}@example.test`;
    const res = await agent.post("/api/v1/auth/register").send({ email, password: PASSWORD }).expect(201);
    const cookie = sessionCookie(res.headers).split(";")[0]!;
    await agent.post("/api/v1/auth/logout").expect(204);
    await t.agent().get("/api/v1/auth/me").set("Cookie", cookie).expect(401);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const { email } = await signedInUser(t);
    const wrong = await t
      .agent()
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password-123" })
      .expect(401);
    const unknown = await t
      .agent()
      .post("/api/v1/auth/login")
      .send({ email: `nobody-${randomUUID()}@example.test`, password: "x" })
      .expect(401);
    expect(wrong.body.error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect",
    });
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it("rejects forged, malformed and expired session cookies", async () => {
    await t.agent().get("/api/v1/auth/me").set("Cookie", "wg_session=forged").expect(401);
    await t
      .agent()
      .get("/api/v1/auth/me")
      .set("Cookie", `wg_session=${"A".repeat(43)}`)
      .expect(401);
    const { agent, id } = await signedInUser(t);
    await t.prisma.session.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await agent.get("/api/v1/auth/me").expect(401);
  });

  it("sets a relative Max-Age so session cookies survive server/client clock skew", async () => {
    // Regression: an absolute Expires derived from the server's clock made cookies arrive
    // already expired whenever the clocks disagreed (here, a server clock years behind).
    const skewed = await startApp({}, { clock: fixedClock("2020-01-01T00:00:00Z") });
    try {
      const agent = skewed.agent();
      const res = await agent
        .post("/api/v1/auth/register")
        .send({ email: `skew-${randomUUID()}@example.test`, password: PASSWORD })
        .expect(201);
      expect(sessionCookie(res.headers)).toMatch(/Max-Age=43200/);
      await agent.get("/api/v1/auth/me").expect(200);
    } finally {
      await skewed.close();
    }
  });

  it("records security events without personal data", async () => {
    const { id, email } = await signedInUser(t);
    await t.agent().post("/api/v1/auth/login").send({ email, password: "wrong-password-123" }).expect(401);
    const events = await t.prisma.auditEvent.findMany({
      where: { userId: id },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual(["REGISTERED", "LOGIN_FAILED"]);
    expect(JSON.stringify(events)).not.toContain(email);
  });
});
