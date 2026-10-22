import { z } from "zod";

import { IdSchema, InstantSchema, MoneySchema, PayPeriodSchema } from "./common.js";

export const PayslipLineSchema = z.strictObject({
  category: z.enum(["HOURS_WORKED", "OVERTIME", "ALLOWANCE", "LEAVE", "OTHER"]),
  description: z.string().trim().min(1).max(200),
  amount: MoneySchema,
});

export const CreatePayslipRequestSchema = z.strictObject({
  employmentId: IdSchema,
  payPeriod: PayPeriodSchema,
  grossPay: MoneySchema,
  lines: z.array(PayslipLineSchema).max(100),
});

export const PayslipResponseSchema = z.strictObject({
  id: IdSchema,
  employmentId: IdSchema,
  payPeriod: PayPeriodSchema,
  grossPay: z.string(),
  lines: z.array(PayslipLineSchema),
  createdAt: InstantSchema,
});

export type CreatePayslipRequest = z.infer<typeof CreatePayslipRequestSchema>;
export type PayslipResponse = z.infer<typeof PayslipResponseSchema>;
