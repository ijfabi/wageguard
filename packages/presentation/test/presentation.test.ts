import { describe, expect, it } from "vitest";

import {
  FINDING_STATUS,
  auditAmounts,
  formatAud,
  formatDate,
  formatDifference,
  formatInstant,
  formatMinutes,
  formatMonth,
  formatShiftSpan,
  formatTime,
  fromCents,
  humaniseShiftIds,
  isMoneyString,
  issueTitle,
  shortHash,
  sumMoney,
  toCents,
  weekdayOf,
} from "../src/index.js";

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

  it("formats instants in an explicit zone and names it", () => {
    expect(formatInstant("2026-07-20T00:30:00Z", "Australia/Sydney")).toBe(
      "20 Jul 2026, 10:30 am (Australia/Sydney)",
    );
    expect(formatInstant("2026-07-20T00:30:00Z", "Australia/Perth")).toBe(
      "20 Jul 2026, 8:30 am (Australia/Perth)",
    );
  });

  it("rejects malformed dates and shortens long identifiers", () => {
    expect(() => formatDate("6 July 2026")).toThrow("Not a date");
    expect(shortHash("9a31fb00e7bdcb2d4624cd3f")).toBe("9a31fb00e7bd…");
    expect(shortHash("abc")).toBe("abc");
    // Without a zone the viewer's own locale clock is used, so only the stable parts are checked.
    expect(formatInstant("2026-07-20T00:30:00Z")).toMatch(/2026/);
  });

  it("formats durations", () => {
    expect(formatMinutes(450)).toBe("7h 30m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(25)).toBe("25m");
  });
});

describe("status wording", () => {
  it("presents MATCHED as information, not a verified pass", () => {
    expect(FINDING_STATUS.MATCHED.tone).toBe("info");
    expect(FINDING_STATUS.MATCHED.label).toBe("Matches calculated minimum");
  });

  it("labels known issue codes and humanises unknown ones", () => {
    expect(issueTitle("OUTSIDE_SPAN_OF_ORDINARY_HOURS")).toBe("Work outside ordinary hours");
    expect(issueTitle("SOMETHING_NEW")).toBe("Something new");
  });
});

describe("auditAmounts", () => {
  const base = {
    calculationStatus: "CALCULATED",
    comparisonBasis: "GROSS_PAY",
    reportedAmount: "800.00",
    expectedAmount: "862.15",
    difference: "-62.15",
    roundingTolerance: "0.03",
  } as const;

  it("labels a complete calculation's difference with the rounding tolerance", () => {
    const [reported, expected, difference] = auditAmounts(base);
    expect(reported).toEqual({
      label: "Reported pay",
      value: "$800.00",
      detail: "Gross pay from your payslip",
    });
    expect(expected.value).toBe("$862.15");
    expect(difference).toEqual({ label: "Difference", value: "-$62.15", detail: "Rounding tolerance $0.03" });
  });

  it("never presents a partial calculation's surplus as an overpayment", () => {
    const partial = {
      ...base,
      calculationStatus: "REVIEW_REQUIRED",
      expectedAmount: "610.70",
      difference: "189.30",
    } as const;
    expect(auditAmounts(partial)[2]).toEqual({
      label: "Difference vs checked shifts",
      value: "+$189.30",
      detail: "Not a verified overpayment: some hours were not priced",
    });
  });

  it("keeps a partial calculation's shortfall as a lower-bound underpayment", () => {
    const partial = {
      ...base,
      calculationStatus: "REVIEW_REQUIRED",
      expectedAmount: "610.70",
      difference: "-10.70",
    } as const;
    expect(auditAmounts(partial)[2].detail).toBe("Paid less than the minimum for the checked shifts alone");
  });

  it("shows a dash when nothing could be compared", () => {
    const none = {
      ...base,
      calculationStatus: "UNSUPPORTED_SCENARIO",
      expectedAmount: null,
      difference: null,
    } as const;
    const [, expected, difference] = auditAmounts(none);
    expect(expected.value).toBe("Not calculated");
    expect(difference).toMatchObject({ value: "—", detail: "No comparison was possible" });
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
