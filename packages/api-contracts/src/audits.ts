import type {
  AuditFinding,
  PayLine,
  PayPeriodCalculationResult,
  ReconciliationResult,
  ShiftResult,
} from "@wageguard/calculation-engine";
import { z } from "zod";

import { IdSchema, InstantSchema, LocalDateSchema, PageQuerySchema, PayPeriodSchema } from "./common.js";

export const FindingStatusSchema = z.enum([
  "MATCHED",
  "POTENTIAL_UNDERPAYMENT",
  "POTENTIAL_OVERPAYMENT",
  "INCOMPLETE_DATA",
  "UNSUPPORTED_SCENARIO",
  "REVIEW_REQUIRED",
]);
export const CalculationStatusSchema = z.enum([
  "CALCULATED",
  "REVIEW_REQUIRED",
  "UNSUPPORTED_SCENARIO",
  "INCOMPLETE_DATA",
]);

/** The pay period is taken from the payslip, so the timesheet and payslip always cover the same dates. */
export const CreateAuditRequestSchema = z.strictObject({
  employmentId: IdSchema,
  payslipId: IdSchema,
  declaredPublicHolidays: z.array(LocalDateSchema).max(31).optional(),
});

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,100}$/, "8-100 characters: letters, digits, '-' or '_'");

export const AuditSummarySchema = z.strictObject({
  id: IdSchema,
  employmentId: IdSchema,
  payslipId: IdSchema,
  status: z.enum(["COMPLETED"]),
  payPeriod: PayPeriodSchema,
  findingStatus: FindingStatusSchema,
  calculationStatus: CalculationStatusSchema,
  expectedAmount: z.string().nullable(),
  reportedAmount: z.string(),
  difference: z.string().nullable(),
  shiftCount: z.number().int(),
  ruleSetVersion: z.string().nullable(),
  engineVersion: z.string(),
  createdAt: InstantSchema,
});

/**
 * Engine and reconciliation structures are typed from the calculation-engine package (their
 * source of truth) rather than re-declared here; in OpenAPI they appear as untyped objects.
 */
export const AuditDetailSchema = AuditSummarySchema.extend({
  ruleSetFingerprint: z.string().nullable(),
  inputHash: z.string(),
  calculatedAt: InstantSchema,
  comparisonBasis: z.string(),
  roundingTolerance: z.string(),
  notes: z.array(z.string()),
  findings: z.array(z.custom<AuditFinding>()),
  assumptions: z.array(z.string()),
});

export const AuditLinesSchema = z.strictObject({
  auditId: IdSchema,
  lines: z.array(z.custom<PayLine>()),
  shifts: z.array(z.custom<ShiftResult>()),
});

export const AuditReportSchema = z.strictObject({
  reportVersion: z.literal(1),
  generatedAt: InstantSchema,
  audit: AuditSummarySchema,
  input: z.custom<unknown>(),
  payslip: z.custom<unknown>(),
  calculation: z.custom<PayPeriodCalculationResult>(),
  reconciliation: z.custom<ReconciliationResult>(),
  disclaimer: z.string(),
});

export const ListAuditsQuerySchema = PageQuerySchema.extend({
  findingStatus: FindingStatusSchema.optional(),
  sort: z.enum(["created_desc", "created_asc"]).default("created_desc"),
});

export type CreateAuditRequest = z.infer<typeof CreateAuditRequestSchema>;
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type AuditDetail = z.infer<typeof AuditDetailSchema>;
export type AuditLines = z.infer<typeof AuditLinesSchema>;
export type AuditReport = z.infer<typeof AuditReportSchema>;
export type ListAuditsQuery = z.infer<typeof ListAuditsQuerySchema>;
