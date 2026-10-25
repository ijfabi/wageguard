import { describe, expect, it } from "vitest";

import {
  BreakKind,
  DomainError,
  DomainErrorCode,
  DomainValidationError,
  EmploymentType,
  LocalDate,
  LocalDateTime,
  Money,
  PayPeriod,
  PayslipLineCategory,
  TimeZone,
  createEmploymentTerms,
  createPayslip,
  paidIntervals,
  payslipCategoryTotal,
  resolveShift,
  type EmploymentTerms,
  type ShiftRecord,
  NO_ALLOWANCES,
} from "../src/index.js";

const sydney = TimeZone.of("Australia/Sydney");
const ldt = (value: string): LocalDateTime => LocalDateTime.parse(value);

const shift = (overrides: Partial<ShiftRecord> = {}): ShiftRecord => ({
  id: "s1",
  start: ldt("2026-07-06T09:00"),
  end: ldt("2026-07-06T17:00"),
  breaks: [],
  ...overrides,
});

const issueCodes = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (error: unknown) {
    if (error instanceof DomainValidationError) {
      return error.issues.map((i) => i.code);
    }
    throw error;
  }
  return [];
};

describe("resolveShift", () => {
  it("resolves a simple shift and computes paid time net of unpaid meal breaks only", () => {
    const resolved = resolveShift(
      shift({
        breaks: [
          { kind: BreakKind.PAID_REST, start: ldt("2026-07-06T10:30"), end: ldt("2026-07-06T10:40") },
          { kind: BreakKind.UNPAID_MEAL, start: ldt("2026-07-06T12:00"), end: ldt("2026-07-06T12:30") },
        ],
      }),
      sydney,
    );
    expect(resolved.interval.durationMinutes()).toBe(480);
    const paid = paidIntervals(resolved).reduce((sum, i) => sum + i.durationMinutes(), 0);
    expect(paid).toBe(450);
  });

  it("sorts breaks chronologically regardless of input order", () => {
    const resolved = resolveShift(
      shift({
        breaks: [
          { kind: BreakKind.UNPAID_MEAL, start: ldt("2026-07-06T13:00"), end: ldt("2026-07-06T13:30") },
          { kind: BreakKind.PAID_REST, start: ldt("2026-07-06T10:00"), end: ldt("2026-07-06T10:10") },
        ],
      }),
      sydney,
    );
    expect(resolved.breaks.map((b) => b.kind)).toEqual([BreakKind.PAID_REST, BreakKind.UNPAID_MEAL]);
  });

  it("handles cross-midnight shifts", () => {
    const resolved = resolveShift(
      shift({ start: ldt("2026-07-06T22:00"), end: ldt("2026-07-07T02:00") }),
      sydney,
    );
    expect(resolved.interval.durationMinutes()).toBe(240);
  });

  it("measures shifts across a DST start by elapsed time, not wall-clock difference", () => {
    const resolved = resolveShift(
      shift({ start: ldt("2026-10-04T01:00"), end: ldt("2026-10-04T04:00") }),
      sydney,
    );
    expect(resolved.interval.durationMinutes()).toBe(120);
  });

  it("measures shifts across a DST end by elapsed time", () => {
    const resolved = resolveShift(
      shift({ start: ldt("2026-04-05T01:00"), end: ldt("2026-04-05T04:00") }),
      sydney,
    );
    expect(resolved.interval.durationMinutes()).toBe(240);
  });

  it("rejects zero-length, reversed and over-long shifts", () => {
    expect(issueCodes(() => resolveShift(shift({ end: ldt("2026-07-06T09:00") }), sydney))).toEqual([
      DomainErrorCode.INVALID_INTERVAL,
    ]);
    expect(issueCodes(() => resolveShift(shift({ end: ldt("2026-07-06T08:00") }), sydney))).toEqual([
      DomainErrorCode.INVALID_INTERVAL,
    ]);
    expect(issueCodes(() => resolveShift(shift({ end: ldt("2026-07-07T09:01") }), sydney))).toEqual([
      DomainErrorCode.INVALID_SHIFT,
    ]);
  });

  it("rejects a blank id and nonexistent / ambiguous start times", () => {
    expect(issueCodes(() => resolveShift(shift({ id: " " }), sydney))).toEqual([
      DomainErrorCode.INVALID_SHIFT,
    ]);
    expect(
      issueCodes(() =>
        resolveShift(shift({ start: ldt("2026-10-04T02:15"), end: ldt("2026-10-04T08:00") }), sydney),
      ),
    ).toEqual([DomainErrorCode.NONEXISTENT_LOCAL_TIME]);
    expect(
      issueCodes(() =>
        resolveShift(shift({ start: ldt("2026-04-05T02:15"), end: ldt("2026-04-05T08:00") }), sydney),
      ),
    ).toEqual([DomainErrorCode.AMBIGUOUS_LOCAL_TIME]);
  });

  it("accepts an ambiguous time when the user supplies the offset", () => {
    const resolved = resolveShift(
      shift({ start: ldt("2026-04-05T02:15"), startUtcOffsetMinutes: 600, end: ldt("2026-04-05T08:00") }),
      sydney,
    );
    expect(resolved.interval.durationMinutes()).toBe(345);
  });

  it("reports every invalid break: outside the shift, overlapping, reversed, ambiguous", () => {
    const codes = issueCodes(() =>
      resolveShift(
        shift({
          breaks: [
            { kind: BreakKind.UNPAID_MEAL, start: ldt("2026-07-06T08:30"), end: ldt("2026-07-06T09:15") },
            { kind: BreakKind.UNPAID_MEAL, start: ldt("2026-07-06T12:00"), end: ldt("2026-07-06T12:30") },
            { kind: BreakKind.PAID_REST, start: ldt("2026-07-06T12:20"), end: ldt("2026-07-06T12:40") },
            { kind: BreakKind.PAID_REST, start: ldt("2026-07-06T15:00"), end: ldt("2026-07-06T14:50") },
          ],
        }),
        sydney,
      ),
    );
    expect(codes).toEqual([
      DomainErrorCode.INVALID_BREAK,
      DomainErrorCode.INVALID_BREAK,
      DomainErrorCode.INVALID_INTERVAL,
    ]);
  });

  it("skips break containment checks when the shift itself is invalid but still reports break errors", () => {
    const codes = issueCodes(() =>
      resolveShift(
        shift({
          end: ldt("2026-07-06T08:00"),
          breaks: [
            { kind: BreakKind.PAID_REST, start: ldt("2026-04-05T02:10"), end: ldt("2026-04-05T02:20") },
          ],
        }),
        sydney,
      ),
    );
    expect(codes).toContain(DomainErrorCode.INVALID_INTERVAL);
    expect(codes).toContain(DomainErrorCode.AMBIGUOUS_LOCAL_TIME);
  });
});

describe("PayPeriod", () => {
  it("enumerates inclusive dates", () => {
    const period = PayPeriod.of(LocalDate.parse("2026-07-06"), LocalDate.parse("2026-07-19"));
    expect(period.lengthInDays()).toBe(14);
    expect(period.dates()[13]?.toString()).toBe("2026-07-19");
    expect(period.containsDate(LocalDate.parse("2026-07-19"))).toBe(true);
    expect(period.containsDate(LocalDate.parse("2026-07-20"))).toBe(false);
    expect(JSON.stringify(period)).toBe('{"startDate":"2026-07-06","endDate":"2026-07-19"}');
  });

  it("rejects reversed and over-long periods", () => {
    expect(() => PayPeriod.of(LocalDate.parse("2026-07-06"), LocalDate.parse("2026-07-05"))).toThrow(
      DomainError,
    );
    expect(() => PayPeriod.of(LocalDate.parse("2026-07-01"), LocalDate.parse("2026-08-01"))).toThrow(
      /31 days/,
    );
  });
});

describe("createPayslip", () => {
  const period = PayPeriod.of(LocalDate.parse("2026-07-06"), LocalDate.parse("2026-07-19"));

  it("accepts lines that sum to gross and totals by category", () => {
    const payslip = createPayslip({
      payPeriod: period,
      grossPay: Money.of("300.00"),
      lines: [
        { category: PayslipLineCategory.HOURS_WORKED, description: "Ordinary", amount: Money.of("260.70") },
        { category: PayslipLineCategory.ALLOWANCE, description: "Laundry", amount: Money.of("39.30") },
      ],
    });
    expect(payslipCategoryTotal(payslip, PayslipLineCategory.HOURS_WORKED).toString()).toBe("260.70");
    expect(Object.isFrozen(payslip.lines)).toBe(true);
  });

  it("rejects inconsistent totals, negative gross, too many lines and long descriptions", () => {
    expect(() =>
      createPayslip({
        payPeriod: period,
        grossPay: Money.of("300.00"),
        lines: [{ category: PayslipLineCategory.HOURS_WORKED, description: "x", amount: Money.of("299.99") }],
      }),
    ).toThrow(/total/);
    expect(() => createPayslip({ payPeriod: period, grossPay: Money.of("-1.00"), lines: [] })).toThrow(
      /negative/,
    );
    const line = { category: PayslipLineCategory.OTHER, description: "x", amount: Money.zero() };
    expect(() =>
      createPayslip({ payPeriod: period, grossPay: Money.zero(), lines: Array(101).fill(line) }),
    ).toThrow(/At most/);
    expect(() =>
      createPayslip({
        payPeriod: period,
        grossPay: Money.zero(),
        lines: [{ ...line, description: "x".repeat(201) }],
      }),
    ).toThrow(/description/);
  });
});

describe("createEmploymentTerms", () => {
  const base: EmploymentTerms = {
    employmentId: "e1",
    awardCode: "MA000004",
    classificationCode: "RETAIL_EMPLOYEE_LEVEL_1",
    employmentType: EmploymentType.PART_TIME,
    timeZone: sydney,
    declarations: {
      awardCoverage: "CONFIRMED",
      enterpriseAgreement: "NONE",
      ageBand: "ADULT_21_PLUS",
      shiftworker: "NO",
    },
    partTimeGuaranteedMinutes: new Map([["MON", 360]]),
    dateOfBirth: null,
    employmentStartDate: null,
    spanException: "NONE",
    schoolStudent: false,
    reducedBreakAgreed: false,
    averagingRoster: false,
    bakingProduction: false,
    apprentice: false,
    allowances: NO_ALLOWANCES,
  };

  it("accepts valid part-time terms and freezes them", () => {
    expect(Object.isFrozen(createEmploymentTerms(base))).toBe(true);
  });

  it("rejects guaranteed hours on non-part-time employment, invalid minutes and blank ids", () => {
    expect(() => createEmploymentTerms({ ...base, employmentType: EmploymentType.CASUAL })).toThrow(
      /part-time/,
    );
    expect(() =>
      createEmploymentTerms({ ...base, partTimeGuaranteedMinutes: new Map([["MON", -1]]) }),
    ).toThrow(/Guaranteed minutes/);
    expect(() =>
      createEmploymentTerms({ ...base, partTimeGuaranteedMinutes: new Map([["MON", 1441]]) }),
    ).toThrow(/Guaranteed minutes/);
    expect(() => createEmploymentTerms({ ...base, employmentId: "" })).toThrow(/employmentId/);
  });
});

describe("DomainError", () => {
  it("exposes an issue with and without a path", () => {
    expect(new DomainError(DomainErrorCode.INVALID_MONEY, "m").toIssue()).toEqual({
      code: "INVALID_MONEY",
      message: "m",
    });
    expect(new DomainError(DomainErrorCode.INVALID_MONEY, "m", "p").toIssue()).toEqual({
      code: "INVALID_MONEY",
      message: "m",
      path: "p",
    });
  });
});
