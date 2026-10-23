import { CreatePayslipRequestSchema, type PayslipResponse } from "@wageguard/api-contracts";

import { sumMoney, toCents } from "@wageguard/presentation";

/**
 * The payslip form validates with the API contract schema plus one rule the server also enforces:
 * itemised lines must add up exactly to gross pay (checked in integer cents, never floats).
 */
export const PayslipFormSchema = CreatePayslipRequestSchema.superRefine((value, ctx) => {
  if (value.payPeriod.endDate < value.payPeriod.startDate) {
    ctx.addIssue({
      code: "custom",
      message: "The pay period must end on or after its start",
      path: ["payPeriod", "endDate"],
    });
  }
  if (value.lines.length > 0) {
    const total = sumMoney(value.lines.map((l) => l.amount));
    if (toCents(total) !== toCents(value.grossPay)) {
      ctx.addIssue({
        code: "custom",
        message: `The lines add up to ${total}, but gross pay is ${value.grossPay}. They must match exactly.`,
        path: ["lines"],
      });
    }
  }
});

export const PAYSLIP_CATEGORY_LABELS: Readonly<Record<PayslipResponse["lines"][number]["category"], string>> =
  {
    HOURS_WORKED: "Hours worked (ordinary and penalty rates)",
    OVERTIME: "Overtime",
    ALLOWANCE: "Allowance",
    LEAVE: "Leave",
    OTHER: "Other",
  };
