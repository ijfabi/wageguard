import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base32Decode, hotp, stepAt } from "../src/modules/identity/totp.js";
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

const register = (app: TestApp, email: string, password = PASSWORD) =>
  app.agent().post("/api/v1/auth/register").send({ email, password });

describe("registration", () => {
  it("emails a confirmation link, and the link signs the user in with a strict session cookie", async () => {
    const email = `New.User-${randomUUID()}@Example.TEST`;
    const res = await register(t, email).expect(202);
    expect(res.body).toEqual({ status: "ACCEPTED", message: expect.any(String) });
    expect(sessionCookie(res.headers)).toBe("");

    const normalised = email.toLowerCase();
    const mail = t.mail.filter((m) => m.to === normalised);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe("Confirm your email for WageGuard");
    // The token travels in the URL fragment, which browsers never send to a server.
    expect(mail[0]!.text).toMatch(/http:\/\/localhost:3000\/verify-email#token=[A-Za-z0-9_-]{43}/);

    const agent = t.agent();
    const verified = await agent
      .post("/api/v1/auth/verify-email")
      .send({ token: t.tokenFor(normalised, "verify-email") })
      .expect(200);
    expect(verified.body).toEqual({
      id: expect.any(String),
      email: normalised,
      createdAt: expect.any(String),
      twoFactorEnabled: false,
    });
    const cookie = sessionCookie(verified.headers);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
    await agent.get("/api/v1/auth/me").expect(200);
  });

  it("accepts each link once", async () => {
    const email = `once-${randomUUID()}@example.test`;
    await register(t, email).expect(202);
    const token = t.tokenFor(email, "verify-email");
    await t.agent().post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const again = await t.agent().post("/api/v1/auth/verify-email").send({ token }).expect(400);
    expect(again.body.error.code).toBe("TOKEN_INVALID");
  });

  it("refuses sign-in until the email is confirmed, and resends the link when the password is right", async () => {
    const email = `unconfirmed-${randomUUID()}@example.test`;
    await register(t, email).expect(202);
    // Within the resend cooldown no second email goes out, but the answer is the same.
    const res = await t.agent().post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    await t.agent().post("/api/v1/auth/login").send({ email, password: "wrong-password-123" }).expect(401);
  });

  it("gives the same answer for an address that already has an account, and emails its owner instead", async () => {
    const { email } = await signedInUser(t);
    const fresh = await register(t, `fresh-${randomUUID()}@example.test`).expect(202);
    const taken = await register(t, email).expect(202);
    expect(taken.body).toEqual(fresh.body);
    expect(t.mail.filter((m) => m.to === email).map((m) => m.subject)).toEqual([
      "Confirm your email for WageGuard",
      "You already have a WageGuard account",
    ]);
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

  it("stores only the SHA-256 of session tokens and email links", async () => {
    const agent = t.agent();
    const email = `token-${randomUUID()}@example.test`;
    await register(t, email).expect(202);
    const link = t.tokenFor(email, "verify-email");
    const stored = await t.prisma.emailToken.findMany({ where: { user: { email } } });
    expect(stored.map((s) => s.tokenHash)).not.toContain(link);
    const res = await agent.post("/api/v1/auth/verify-email").send({ token: link }).expect(200);
    const token = sessionCookie(res.headers).split(";")[0]!.split("=")[1]!;
    const sessions = await t.prisma.session.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[0]!.tokenHash).not.toBe(token);
  });

  it("rejects short passwords, malformed emails and unknown fields", async () => {
    const short = await t
      .agent()
      .post("/api/v1/auth/register")
      .send({ email: "a@example.test", password: "short" })
      .expect(422);
    expect(short.body.error.issues[0]).toMatchObject({ path: "password" });
    await register(t, "not-an-email").expect(422);
    await t
      .agent()
      .post("/api/v1/auth/register")
      .send({ email: "b@example.test", password: PASSWORD, isAdmin: true })
      .expect(422);
  });
});

describe("registration races and stored-data faults", () => {
  it("answers simultaneous sign-ups for one email the same way and creates one account", async () => {
    const email = `race-${randomUUID()}@example.test`;
    const statuses = await Promise.all(
      Array.from({ length: 5 }, () => register(t, email).then((r) => r.status)),
    );
    expect(statuses).toEqual([202, 202, 202, 202, 202]);
    expect(await t.prisma.user.count({ where: { email } })).toBe(1);
    // Whichever link was sent last is the one that works.
    await t
      .agent()
      .post("/api/v1/auth/verify-email")
      .send({ token: t.tokenFor(email, "verify-email") })
      .expect(200);
  });

  it("treats a corrupted stored password hash as a server fault, not a wrong password", async () => {
    const { email, id } = await signedInUser(t);
    await t.prisma.user.update({ where: { id }, data: { passwordHash: "not-an-argon2-hash" } });
    const res = await t.agent().post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("clears the user's expired sessions when a new one is issued", async () => {
    const { email, id } = await signedInUser(t);
    await t.prisma.session.create({
      data: { userId: id, tokenHash: "e".repeat(64), expiresAt: new Date(Date.now() - 60_000) },
    });
    await t.agent().post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    const remaining = await t.prisma.session.findMany({ where: { userId: id } });
    expect(remaining.every((s) => s.expiresAt.getTime() > Date.now())).toBe(true);
    expect(remaining).toHaveLength(2); // the sign-up session and the new one
  });
});

describe("sessions", () => {
  it("logs in, identifies the user, and logs out (revoking the session server-side)", async () => {
    const { email } = await signedInUser(t);
    const agent = t.agent();
    const res = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    expect(res.body).toMatchObject({ status: "SIGNED_IN", me: { email } });
    await agent.get("/api/v1/auth/me").expect(200);
    await agent.post("/api/v1/auth/logout").expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
  });

  it("revokes the session row so a stolen cookie stops working after logout", async () => {
    const { email } = await signedInUser(t);
    const agent = t.agent();
    const res = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
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
      const email = `skew-${randomUUID()}@example.test`;
      await register(skewed, email).expect(202);
      const agent = skewed.agent();
      const res = await agent
        .post("/api/v1/auth/verify-email")
        .send({ token: skewed.tokenFor(email, "verify-email") })
        .expect(200);
      expect(sessionCookie(res.headers)).toMatch(/Max-Age=43200/);
      await agent.get("/api/v1/auth/me").expect(200);
    } finally {
      await skewed.close();
    }
  });

  it("lists the user's sessions with a coarse device name, and signs out others", async () => {
    const { agent, email } = await signedInUser(t);
    const phone = t.agent();
    await phone
      .post("/api/v1/auth/login")
      .set(
        "User-Agent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      )
      .send({ email, password: PASSWORD })
      .expect(200);
    const list = await agent.get("/api/v1/auth/sessions").expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.body.items.map((s: { device: string | null }) => s.device)).toContain("Safari on iOS");

    // Someone else's session id is a 404, like every other resource.
    const other = await signedInUser(t);
    const otherSessions = await other.agent.get("/api/v1/auth/sessions").expect(200);
    await agent.delete(`/api/v1/auth/sessions/${otherSessions.body.items[0].id as string}`).expect(404);

    await agent.delete("/api/v1/auth/sessions").expect(204);
    await phone.get("/api/v1/auth/me").expect(401);
    await agent.get("/api/v1/auth/me").expect(200);
  });

  it("records security events without personal data", async () => {
    const { id, email } = await signedInUser(t);
    await t.agent().post("/api/v1/auth/login").send({ email, password: "wrong-password-123" }).expect(401);
    const events = await t.prisma.auditEvent.findMany({
      where: { userId: id },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual(["REGISTERED", "EMAIL_VERIFIED", "LOGIN_FAILED"]);
    expect(JSON.stringify(events)).not.toContain(email);
  });
});

describe("passwords", () => {
  it("resets a forgotten password from an emailed link and signs out every session", async () => {
    const { agent, email } = await signedInUser(t);
    const res = await t.agent().post("/api/v1/auth/password-reset").send({ email }).expect(202);
    const unknown = await t
      .agent()
      .post("/api/v1/auth/password-reset")
      .send({ email: `nobody-${randomUUID()}@example.test` })
      .expect(202);
    expect(unknown.body).toEqual(res.body);

    const token = t.tokenFor(email, "reset-password");
    const newPassword = "a whole new passphrase";
    await t
      .agent()
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: newPassword })
      .expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
    await t.agent().post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(401);
    await t.agent().post("/api/v1/auth/login").send({ email, password: newPassword }).expect(200);
    await t
      .agent()
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: "and another passphrase" })
      .expect(400);
    expect(t.mail.filter((m) => m.to === email).at(-1)?.subject).toBe(
      "WageGuard security notice: your password was reset",
    );
  });

  it("only honours the newest reset link, and expires links after 30 minutes", async () => {
    const clock = fixedClock("2026-10-22T00:00:00Z");
    const timed = await startApp({}, { clock });
    try {
      const { email } = await signedInUser(timed);
      await timed.agent().post("/api/v1/auth/password-reset").send({ email }).expect(202);
      const first = timed.tokenFor(email, "reset-password");
      clock.set("2026-10-22T00:01:01Z");
      await timed.agent().post("/api/v1/auth/password-reset").send({ email }).expect(202);
      const second = timed.tokenFor(email, "reset-password");
      expect(second).not.toBe(first);
      const confirm = (token: string) =>
        timed
          .agent()
          .post("/api/v1/auth/password-reset/confirm")
          .send({ token, password: "fresh passphrase 1" });
      await confirm(first).expect(400);
      clock.set("2026-10-22T00:31:02Z");
      await confirm(second).expect(400);
    } finally {
      await timed.close();
    }
  });

  it("changes the password with the current one and signs out the other sessions", async () => {
    const { agent, email } = await signedInUser(t);
    const laptop = t.agent();
    await laptop.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    await agent
      .post("/api/v1/auth/password")
      .send({ currentPassword: "not my password", newPassword: "changed passphrase 1" })
      .expect(401);
    await agent
      .post("/api/v1/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: "changed passphrase 1" })
      .expect(204);
    await agent.get("/api/v1/auth/me").expect(200);
    await laptop.get("/api/v1/auth/me").expect(401);
  });
});

describe("two-factor sign-in", () => {
  const clock = fixedClock("2026-10-22T00:00:00Z");
  let app: TestApp;
  beforeAll(async () => {
    app = await startApp({}, { clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const codeAt = (secret: string, iso: string) => hotp(base32Decode(secret), stepAt(Date.parse(iso)));

  async function enrolled() {
    clock.set("2026-10-22T00:00:00Z");
    const user = await signedInUser(app);
    const setup = await user.agent
      .post("/api/v1/auth/two-factor/setup")
      .send({ password: PASSWORD })
      .expect(200);
    const secret = setup.body.secret as string;
    expect(setup.body.otpauthUri).toMatch(
      /^otpauth:\/\/totp\/WageGuard%3A.+\?secret=[A-Z2-7]+&issuer=WageGuard/,
    );
    const enabled = await user.agent
      .post("/api/v1/auth/two-factor/enable")
      .send({ code: codeAt(secret, "2026-10-22T00:00:00Z") })
      .expect(200);
    return { ...user, secret, recoveryCodes: enabled.body.recoveryCodes as string[] };
  }

  it("needs a code after the password, and the half-signed-in session can do nothing else", async () => {
    const { email, secret, recoveryCodes } = await enrolled();
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    clock.set("2026-10-22T00:01:00Z");
    const agent = app.agent();
    const login = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    expect(login.body).toEqual({ status: "TWO_FACTOR_REQUIRED" });
    expect(sessionCookie(login.headers)).toMatch(/Max-Age=600/);
    const blocked = await agent.get("/api/v1/auth/me").expect(401);
    expect(blocked.body.error.code).toBe("TWO_FACTOR_REQUIRED");
    await agent.get("/api/v1/employments").expect(401);

    const me = await agent
      .post("/api/v1/auth/login/two-factor")
      .send({ code: codeAt(secret, "2026-10-22T00:01:00Z") })
      .expect(200);
    expect(me.body).toMatchObject({ email, twoFactorEnabled: true });
    await agent.get("/api/v1/auth/me").expect(200);
  });

  it("refuses a code that has already been used", async () => {
    const { email, secret } = await enrolled();
    clock.set("2026-10-22T00:02:00Z");
    const code = codeAt(secret, "2026-10-22T00:02:00Z");
    const first = app.agent();
    await first.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    await first.post("/api/v1/auth/login/two-factor").send({ code }).expect(200);
    const second = app.agent();
    await second.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    const replay = await second.post("/api/v1/auth/login/two-factor").send({ code }).expect(401);
    expect(replay.body.error.code).toBe("TWO_FACTOR_INVALID");
  });

  it("accepts each recovery code once", async () => {
    const { email, recoveryCodes } = await enrolled();
    const signIn = async () => {
      const agent = app.agent();
      await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
      return agent.post("/api/v1/auth/login/two-factor").send({ code: recoveryCodes[3]!.toUpperCase() });
    };
    expect((await signIn()).status).toBe(200);
    expect((await signIn()).status).toBe(401);
  });

  it("throws the pending session away after five wrong codes", async () => {
    const { email } = await enrolled();
    const agent = app.agent();
    await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    for (let i = 0; i < 4; i += 1) {
      const res = await agent.post("/api/v1/auth/login/two-factor").send({ code: "000000" }).expect(401);
      expect(res.body.error.code).toBe("TWO_FACTOR_INVALID");
    }
    const last = await agent.post("/api/v1/auth/login/two-factor").send({ code: "000000" }).expect(401);
    expect(last.body.error.code).toBe("UNAUTHENTICATED");
    await agent.post("/api/v1/auth/login/two-factor").send({ code: "000000" }).expect(401);
  });

  it("stores the secret encrypted, signs out other sessions when turned on, and turns off with password and code", async () => {
    const clockStart = "2026-10-22T00:00:00Z";
    clock.set(clockStart);
    const user = await signedInUser(app);
    const elsewhere = app.agent();
    await elsewhere.post("/api/v1/auth/login").send({ email: user.email, password: PASSWORD }).expect(200);
    const setup = await user.agent
      .post("/api/v1/auth/two-factor/setup")
      .send({ password: PASSWORD })
      .expect(200);
    const row = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpSecret).toMatch(/^v1\./);
    expect(row.totpSecret).not.toContain(setup.body.secret);
    await user.agent
      .post("/api/v1/auth/two-factor/enable")
      .send({ code: codeAt(setup.body.secret as string, clockStart) })
      .expect(200);
    await elsewhere.get("/api/v1/auth/me").expect(401);

    clock.set("2026-10-22T00:05:00Z");
    const code = codeAt(setup.body.secret as string, "2026-10-22T00:05:00Z");
    await user.agent.post("/api/v1/auth/two-factor/disable").send({ password: "wrong", code }).expect(401);
    await user.agent.post("/api/v1/auth/two-factor/disable").send({ password: PASSWORD, code }).expect(204);
    expect((await user.agent.get("/api/v1/auth/me").expect(200)).body.twoFactorEnabled).toBe(false);
    expect(await app.prisma.recoveryCode.count({ where: { userId: user.id } })).toBe(0);
  });

  it("is unavailable, not broken, when the server has no encryption key", async () => {
    const keyless = await startApp({ TOTP_ENCRYPTION_KEY: "" }, {});
    try {
      const { agent } = await signedInUser(keyless);
      const res = await agent.post("/api/v1/auth/two-factor/setup").send({ password: PASSWORD }).expect(503);
      expect(res.body.error.code).toBe("TWO_FACTOR_UNAVAILABLE");
    } finally {
      await keyless.close();
    }
  });
});
