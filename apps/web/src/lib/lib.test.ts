import { describe, expect, it } from "vitest";

import { buildCsp, createNonce } from "./csp";
import { parseDuration, toCreateEmploymentRequest, EMPTY_EMPLOYMENT_FORM } from "./employment-form";
import { PayslipFormSchema } from "./payslip-form";
import { safeRedirect } from "./safe-redirect";
import { ShiftFormSchema, fromShiftResponse, toShiftTimes, type ShiftFormValues } from "./shift-form";
import { FINDING_STATUS, TONE_CLASSES } from "./status";

describe("shift form mapping", () => {
  const base: ShiftFormValues = {
    employmentId: "0190f2a0-0000-7000-8000-000000000001",
    date: "2026-07-06",
    start: "09:00",
    end: "17:00",
    mealStart: "12:00",
    mealEnd: "12:30",
    restBreaks: [{ start: "10:30", end: "10:40" }],
  };

  it("maps a same-day shift with breaks", () => {
    expect(toShiftTimes(base)).toEqual({
      start: "2026-07-06T09:00",
      end: "2026-07-06T17:00",
      breaks: [
        { kind: "UNPAID_MEAL", start: "2026-07-06T12:00", end: "2026-07-06T12:30" },
        { kind: "PAID_REST", start: "2026-07-06T10:30", end: "2026-07-06T10:40" },
      ],
    });
  });

  it("rolls end and break times before the start onto the next day (cross-midnight)", () => {
    const night = {
      ...base,
      date: "2026-12-31",
      start: "22:00",
      end: "02:00",
      mealStart: "00:00",
      mealEnd: "00:30",
      restBreaks: [],
    };
    expect(toShiftTimes(night)).toEqual({
      start: "2026-12-31T22:00",
      end: "2027-01-01T02:00",
      breaks: [{ kind: "UNPAID_MEAL", start: "2027-01-01T00:00", end: "2027-01-01T00:30" }],
    });
  });

  it("validates the form and round-trips stored shifts", () => {
    expect(ShiftFormSchema.safeParse({ ...base, end: "09:00" }).success).toBe(false);
    expect(ShiftFormSchema.safeParse({ ...base, mealEnd: "" }).success).toBe(false);
    expect(ShiftFormSchema.safeParse({ ...base, start: "9:00" }).success).toBe(false);
    const stored = {
      id: "s",
      employmentId: base.employmentId,
      ...toShiftTimes(base),
      startUtcOffsetMinutes: null,
      endUtcOffsetMinutes: null,
      startAt: "",
      endAt: "",
      version: 1,
      createdAt: "",
      updatedAt: "",
    };
    expect(fromShiftResponse(stored)).toEqual(base);
  });
});

describe("employment form mapping", () => {
  it("parses H:MM durations", () => {
    expect(parseDuration("7:36")).toBe(456);
    expect(parseDuration("")).toBeNull();
    expect(() => parseDuration("7.5")).toThrow();
    expect(() => parseDuration("25:00")).toThrow();
  });

  it("sends guaranteed hours only for part-time employment", () => {
    const casual = toCreateEmploymentRequest({ ...EMPTY_EMPLOYMENT_FORM, label: " Shop " });
    expect(casual).toMatchObject({ label: "Shop", awardCode: "MA000004", employmentType: "CASUAL" });
    expect(casual).not.toHaveProperty("partTimeGuaranteedMinutes");
    const partTime = toCreateEmploymentRequest({
      ...EMPTY_EMPLOYMENT_FORM,
      label: "Shop",
      employmentType: "PART_TIME",
      guaranteed: { ...EMPTY_EMPLOYMENT_FORM.guaranteed, MON: "5:30", SAT: "8:00" },
    });
    expect(partTime.partTimeGuaranteedMinutes).toEqual({ MON: 330, SAT: 480 });
  });
});

describe("payslip form", () => {
  const valid = {
    employmentId: "0190f2a0-0000-7000-8000-000000000001",
    payPeriod: { startDate: "2026-07-06", endDate: "2026-07-19" },
    grossPay: "300.00",
    lines: [
      { category: "HOURS_WORKED", description: "Ordinary", amount: "260.70" },
      { category: "ALLOWANCE", description: "Laundry", amount: "39.30" },
    ],
  };

  it("requires itemised lines to sum exactly to gross pay", () => {
    expect(PayslipFormSchema.safeParse(valid).success).toBe(true);
    const off = PayslipFormSchema.safeParse({ ...valid, grossPay: "300.01" });
    expect(off.success).toBe(false);
    expect(off.error?.issues[0]?.message).toMatch(/add up to 300.00/);
  });

  it("rejects a pay period that ends before it starts", () => {
    expect(
      PayslipFormSchema.safeParse({ ...valid, payPeriod: { startDate: "2026-07-19", endDate: "2026-07-06" } })
        .success,
    ).toBe(false);
  });
});

describe("safe redirect", () => {
  it.each([
    ["/audits/123", "/audits/123"],
    ["/shifts?employmentId=x", "/shifts?employmentId=x"],
    [null, "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["/ok\nSet-Cookie:x", "/dashboard"],
  ])("%s -> %s", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});

describe("content security policy", () => {
  it("allows only nonce-bearing scripts in production", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("adds 'unsafe-eval' only in development", () => {
    expect(buildCsp("n", true)).toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("creates unpredictable 128-bit nonces", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
    for (const nonce of nonces) {
      expect(atob(nonce)).toHaveLength(16);
    }
  });
});

describe("status presentation", () => {
  it("never uses a green success tone, even for MATCHED", () => {
    expect(FINDING_STATUS.MATCHED.tone).toBe("info");
    for (const classes of Object.values(TONE_CLASSES)) {
      expect(classes).not.toMatch(/green|emerald|success/);
    }
  });
});
