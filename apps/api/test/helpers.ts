import { randomUUID } from "node:crypto";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Instant } from "@wageguard/domain";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { inject } from "vitest";

import { createApp } from "../src/app.factory.js";
import type { AppOverrides } from "../src/app.module.js";
import { loadConfig, type AppConfig } from "../src/config/config.js";
import type { Clock } from "../src/infrastructure/clock.js";
import type { MailMessage, Mailer } from "../src/infrastructure/mailer.js";
import { PrismaService } from "../src/infrastructure/prisma.service.js";

export const PASSWORD = "correct horse battery staple";
export const ORIGIN = "http://localhost:3000";

export function testConfig(env: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: inject("databaseUrl"),
    LOG_LEVEL: process.env["TEST_LOG_LEVEL"] ?? "silent",
    ALLOWED_ORIGINS: ORIGIN,
    RATE_LIMIT_PER_MINUTE: "100000",
    AUTH_RATE_LIMIT_PER_MINUTE: "100000",
    // Test files run in parallel against one database, so shared counters would mix their traffic.
    // rate-limit.test.ts covers the PostgreSQL store on its own.
    RATE_LIMIT_STORE: "memory",
    // Test-only key: 32 bytes of 0x01.
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    ...env,
  });
}

/** A controllable clock, so audit timestamps are deterministic in tests. */
export function fixedClock(iso = "2026-10-22T00:00:00Z"): Clock & { set(iso: string): void } {
  let now = Instant.parse(iso);
  return { now: () => now, set: (value) => (now = Instant.parse(value)) };
}

/** Collects sent email in memory. */
export function memoryMailer(): Mailer & { readonly sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly prisma: PrismaService;
  readonly agent: () => TestAgent;
  readonly mail: MailMessage[];
  /** The token from the newest email to this address with a link to the given page. */
  tokenFor(email: string, page: "verify-email" | "reset-password"): string;
  close(): Promise<void>;
}

export async function startApp(
  env: Record<string, string> = {},
  overrides: AppOverrides = {},
): Promise<TestApp> {
  const mailer = memoryMailer();
  const app = await createApp(testConfig(env), { mailer, ...overrides });
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    agent: () => request.agent(app.getHttpServer()),
    mail: mailer.sent,
    tokenFor(email, page) {
      const pattern = new RegExp(`/${page}#token=([A-Za-z0-9_-]{43})`);
      const match = mailer.sent
        .filter((m) => m.to === email)
        .map((m) => pattern.exec(m.text)?.[1])
        .filter((token) => token !== undefined)
        .at(-1);
      if (match === undefined) {
        throw new Error(`No ${page} email for ${email}`);
      }
      return match;
    },
    close: () => app.close(),
  };
}

/**
 * Registers a fresh user, confirms their email through the emailed link (which signs them in) and
 * returns an agent that carries their session cookie.
 */
export async function signedInUser(t: TestApp): Promise<{ agent: TestAgent; email: string; id: string }> {
  const agent = t.agent();
  const email = `user-${randomUUID()}@example.test`;
  await agent.post("/api/v1/auth/register").send({ email, password: PASSWORD }).expect(202);
  const res = await agent
    .post("/api/v1/auth/verify-email")
    .send({ token: t.tokenFor(email, "verify-email") })
    .expect(200);
  return { agent, email, id: (res.body as { id: string }).id };
}

export const CASUAL_EMPLOYMENT = {
  label: "Casual retail job",
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
} as const;

/** Work conditions with nothing unusual, for overriding one field at a time. */
export const NO_CONDITIONS = {
  spanException: "NONE",
  schoolStudent: false,
  reducedBreakAgreed: false,
  averagingRoster: false,
  bakingProduction: false,
  apprentice: false,
} as const;

export async function createEmployment(
  agent: TestAgent,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await agent
    .post("/api/v1/employments")
    .send({ ...CASUAL_EMPLOYMENT, ...overrides })
    .expect(201);
  return (res.body as { id: string }).id;
}

export async function createShift(
  agent: TestAgent,
  employmentId: string,
  start: string,
  end: string,
  meal?: [string, string],
): Promise<{ id: string; version: number }> {
  const res = await agent
    .post("/api/v1/shifts")
    .send({
      employmentId,
      start,
      end,
      breaks: meal === undefined ? [] : [{ kind: "UNPAID_MEAL", start: meal[0], end: meal[1] }],
    })
    .expect(201);
  return res.body as { id: string; version: number };
}

/** 2026-07-06 is a Monday. */
export const FORTNIGHT = { startDate: "2026-07-06", endDate: "2026-07-19" };

export async function createPayslip(
  agent: TestAgent,
  employmentId: string,
  grossPay: string,
): Promise<string> {
  const res = await agent
    .post("/api/v1/payslips")
    .send({ employmentId, payPeriod: FORTNIGHT, grossPay, lines: [] })
    .expect(201);
  return (res.body as { id: string }).id;
}
