import { describe, expect, it } from "vitest";

import { parseDuration, toCreateEmploymentRequest, EMPTY_EMPLOYMENT_FORM } from "./employment-form";
import { formatDate, formatMinutes, formatMonth, formatShiftSpan, formatTime, weekdayOf } from "./format";
import { humaniseShiftIds } from "./humanise";
import { formatAud, formatDifference, fromCents, isMoneyString, sumMoney, toCents } from "./money";
import { PayslipFormSchema } from "./payslip-form";
import { safeRedirect } from "./safe-redirect";
import { ShiftFormSchema, fromShiftResponse, toShiftTimes, type ShiftFormValues } from "./shift-form";
import { FINDING_STATUS, TONE_CLASSES, issueTitle } from "./status";

describe("money", () => {
  it("converts between strings and integer cents exactly", () => {
    expect(toCents("862.15")).toBe(86_215n);
    expect(toCents("-62.15")).toBe(-6_215n);
    expect(toCents("12.5")).toBe(1_250n);
    expect(toCents("7")).toBe(700n);
    expect(fromCents(-5n)).toBe("-0.05");
    expect(() => toCents("1.234")).toThrow();
    expect(() => toCents("1e3")).toThrow();
  });

  it("adds without floating-point error", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney(["260.70", "333.76", "267.69"])).toBe("862.15");
    expect(sumMoney(["", "1.00"])).toBe("1.00");
  });

  it("formats Australian dollars with separators and signs", () => {
    expect(formatAud("1234567.5")).toBe("$1,234,567.50");
    expect(formatAud("-62.15")).toBe("-$62.15");
    expect(formatAud("0")).toBe("$0.00");
    expect(formatDifference("1.00")).toBe("+$1.00");
    expect(formatDifference("-0.03")).toBe("-$0.03");
    expect(formatDifference("0.00")).toBe("$0.00");
    expect(isMoneyString("12.50")).toBe(true);
    expect(isMoneyString("12,50")).toBe(false);
  });
});

describe("format", () => {
  it("formats wall-clock dates and times without time-zone conversion", () => {
    expect(weekdayOf("2026-07-06")).toBe("Mon");
    expect(formatDate("2026-07-06")).toBe("Mon 6 Jul 2026");
    expect(formatTime("00:05")).toBe("12:05 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("18:30")).toBe("6:30 pm");
    expect(formatShiftSpan("2026-07-06T09:00", "2026-07-06T17:00")).toBe("Mon 6 Jul 2026, 9:00 am – 5:00 pm");
    expect(formatShiftSpan("2026-07-10T22:00", "2026-07-11T02:00")).toBe(
      "Fri 10 Jul 2026, 10:00 pm – Sat 11 Jul 2026, 2:00 am",
    );
    expect(formatMonth("2026-07")).toBe("Jul 2026");
  });

  it("formats durations", () => {
    expect(formatMinutes(450)).toBe("7h 30m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(25)).toBe("25m");
  });
});

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

describe("status presentation", () => {
  it("never uses a green success tone, even for MATCHED", () => {
    expect(FINDING_STATUS.MATCHED.tone).toBe("info");
    for (const classes of Object.values(TONE_CLASSES)) {
      expect(classes).not.toMatch(/green|emerald|success/);
    }
  });

  it("labels known issue codes and humanises unknown ones", () => {
    expect(issueTitle("OUTSIDE_SPAN_OF_ORDINARY_HOURS")).toBe("Work outside ordinary hours");
    expect(issueTitle("SOMETHING_NEW")).toBe("Something new");
  });
});

describe("humaniseShiftIds", () => {
  it("replaces known shift ids with the shift's local times and leaves others alone", () => {
    const shifts = [{ shiftId: "01a1-shift", localStart: "2026-07-24T17:00", localEnd: "2026-07-24T22:00" }];
    expect(humaniseShiftIds("Shift 01a1-shift has 60 paid minute(s) outside the span.", shifts)).toBe(
      "Shift (Fri 24 Jul 2026, 5:00 pm – 10:00 pm) has 60 paid minute(s) outside the span.",
    );
    expect(humaniseShiftIds("Shift other-id ended late.", shifts)).toBe("Shift other-id ended late.");
  });
});
