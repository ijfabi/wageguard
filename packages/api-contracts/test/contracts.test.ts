import { z } from "zod";
import { describe, expect, it } from "vitest";

import * as contracts from "../src/index.js";
import {
  CreateEmploymentRequestSchema,
  CreatePayslipRequestSchema,
  CreateShiftRequestSchema,
  IdempotencyKeySchema,
  ListShiftsQuerySchema,
  MoneySchema,
  RegisterRequestSchema,
  TwoFactorLoginRequestSchema,
  UpdateShiftRequestSchema,
} from "../src/index.js";

const employment = {
  label: "Job",
  awardCode: "MA000004",
  classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
  employmentType: "PART_TIME",
  state: "NSW",
  timeZone: "Australia/Sydney",
  declarations: {
    awardCoverage: "CONFIRMED",
    enterpriseAgreement: "NONE",
    ageBand: "ADULT_21_PLUS",
    shiftworker: "NO",
  },
} as const;

describe("request contracts", () => {
  it("normalise emails and enforce password length", () => {
    expect(RegisterRequestSchema.parse({ email: "  Ana@Example.COM ", password: "x".repeat(12) }).email).toBe(
      "ana@example.com",
    );
    expect(
      RegisterRequestSchema.safeParse({ email: "ana@example.com", password: "x".repeat(11) }).success,
    ).toBe(false);
    expect(
      RegisterRequestSchema.safeParse({ email: "ana@example.com", password: "x".repeat(129) }).success,
    ).toBe(false);
  });

  it("reject unknown fields everywhere (no mass assignment)", () => {
    expect(
      RegisterRequestSchema.safeParse({ email: "a@example.com", password: "x".repeat(12), role: "admin" })
        .success,
    ).toBe(false);
    expect(CreateEmploymentRequestSchema.safeParse({ ...employment, userId: "someone-else" }).success).toBe(
      false,
    );
    expect(
      UpdateShiftRequestSchema.safeParse({
        version: 1,
        employmentId: "x",
        start: "2026-07-06T09:00",
        end: "2026-07-06T10:00",
        breaks: [],
      }).success,
    ).toBe(false);
  });

  it("only allow guaranteed hours on part-time employment", () => {
    expect(
      CreateEmploymentRequestSchema.safeParse({ ...employment, partTimeGuaranteedMinutes: { MON: 240 } })
        .success,
    ).toBe(true);
    expect(
      CreateEmploymentRequestSchema.safeParse({
        ...employment,
        employmentType: "CASUAL",
        partTimeGuaranteedMinutes: { MON: 240 },
      }).success,
    ).toBe(false);
  });

  it("require the state, and keep school-student engagement and dates consistent", () => {
    const withoutState = Object.fromEntries(Object.entries(employment).filter(([key]) => key !== "state"));
    expect(CreateEmploymentRequestSchema.safeParse(withoutState).success).toBe(false);
    const conditions = {
      spanException: "NONE",
      schoolStudent: true,
      reducedBreakAgreed: false,
      averagingRoster: false,
      bakingProduction: false,
      apprentice: false,
    };
    expect(CreateEmploymentRequestSchema.safeParse({ ...employment, conditions }).success).toBe(false);
    expect(
      CreateEmploymentRequestSchema.safeParse({ ...employment, employmentType: "CASUAL", conditions })
        .success,
    ).toBe(true);
    expect(
      CreateEmploymentRequestSchema.safeParse({
        ...employment,
        dateOfBirth: "2010-05-01",
        employmentStartDate: "2010-05-01",
      }).success,
    ).toBe(false);
  });

  it("accept six-digit and recovery codes for two-factor sign-in, ignoring spaces and case", () => {
    expect(TwoFactorLoginRequestSchema.parse({ code: " 123 456 " }).code).toBe("123456");
    expect(TwoFactorLoginRequestSchema.parse({ code: "K7QM-2XPD-9FNE" }).code).toBe("k7qm-2xpd-9fne");
    for (const bad of ["12345", "1234567", "abcdef", "k7qm2xpd9fne"]) {
      expect(TwoFactorLoginRequestSchema.safeParse({ code: bad }).success, bad).toBe(false);
    }
  });

  it("accept money only as non-negative strings with at most 2 decimals", () => {
    for (const ok of ["0", "12.5", "862.15", "999999999999.99"]) {
      expect(MoneySchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ["-1.00", "1.234", "1e3", "", " 1"]) {
      expect(MoneySchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(MoneySchema.safeParse(12.5).success).toBe(false);
    expect(
      CreatePayslipRequestSchema.safeParse({
        employmentId: crypto.randomUUID(),
        payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
        grossPay: "1.00",
        lines: Array.from({ length: 101 }, () => ({ category: "OTHER", description: "x", amount: "0.00" })),
      }).success,
    ).toBe(false);
  });

  it("bound shift breaks, page size and sort keys", () => {
    const shift = { employmentId: crypto.randomUUID(), start: "2026-07-06T09:00", end: "2026-07-06T17:00" };
    const tooManyBreaks = Array.from({ length: 11 }, () => ({
      kind: "PAID_REST",
      start: "2026-07-06T10:00",
      end: "2026-07-06T10:10",
    }));
    expect(CreateShiftRequestSchema.safeParse({ ...shift, breaks: tooManyBreaks }).success).toBe(false);
    expect(ListShiftsQuerySchema.parse({}).limit).toBe(25);
    expect(ListShiftsQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(ListShiftsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(ListShiftsQuerySchema.safeParse({ sort: "id; DROP TABLE shifts" }).success).toBe(false);
  });

  it("restrict idempotency keys to a safe alphabet and length", () => {
    expect(IdempotencyKeySchema.safeParse(crypto.randomUUID()).success).toBe(true);
    for (const bad of ["short", "has spaces here", "x".repeat(101), "key\nwith-newline"]) {
      expect(IdempotencyKeySchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("OpenAPI compatibility", () => {
  it("every exported schema converts to JSON Schema (custom engine types become open objects)", () => {
    const schemas = Object.entries(contracts as Record<string, unknown>).filter(
      (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
    );
    expect(schemas.length).toBeGreaterThan(20);
    for (const [name, schema] of schemas) {
      expect(() => z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }), name).not.toThrow();
    }
  });
});
