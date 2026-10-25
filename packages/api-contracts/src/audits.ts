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

const HhMmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const AuditPublicHolidaySchema = z.strictObject({
  date: LocalDateSchema,
  /** Part-day holidays start at this local time. */
  from: HhMmSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const LeaveEntrySchema = z.strictObject({
  kind: z.enum(["ANNUAL", "PERSONAL_CARERS", "COMPASSIONATE", "PUBLIC_HOLIDAY_NOT_WORKED"]),
  minutes: z
    .number()
    .int()
    .positive()
    .max(31 * 24 * 60),
});

export const AllowanceClaimsSchema = z.strictObject({
  coldWorkMinutes: z
    .number()
    .int()
    .min(0)
    .max(31 * 24 * 60)
    .optional(),
  belowZeroMinutes: z
    .number()
    .int()
    .min(0)
    .max(31 * 24 * 60)
    .optional(),
  vehicleKilometres: z
    .string()
    .regex(/^\d{1,5}(\.\d)?$/, "Up to one decimal place")
    .optional(),
  /** Dates with overtime required without 24 hours' notice and no meal supplied (cl. 19.2). */
  mealAllowanceDates: z.array(LocalDateSchema).max(31).optional(),
});

/** The pay period is taken from the payslip, so the timesheet and payslip always cover the same dates. */
export const CreateAuditRequestSchema = z.strictObject({
  employmentId: IdSchema,
  payslipId: IdSchema,
  /** Whole-day holidays, kept for older clients. Merged with `publicHolidays`. */
  declaredPublicHolidays: z.array(LocalDateSchema).max(31).optional(),
  /**
   * The public holidays that applied where the work was done. When omitted, the state-wide holidays
   * from the calendar for the employment's state are used.
   */
  publicHolidays: z.array(AuditPublicHolidaySchema).max(31).optional(),
  /** Part-time: guaranteed hours varied in writing for particular dates (cl. 10.6). */
  guaranteedHoursVariations: z
    .array(z.strictObject({ date: LocalDateSchema, minutes: z.number().int().min(0).max(1440) }))
    .max(31)
    .optional(),
  allowanceClaims: AllowanceClaimsSchema.optional(),
  leave: z.array(LeaveEntrySchema).max(10).optional(),
});

export const PublicHolidaysQuerySchema = z.strictObject({
  state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
  from: LocalDateSchema,
  to: LocalDateSchema,
});

export const PublicHolidaysResponseSchema = z.strictObject({
  holidays: z.array(
    z.strictObject({
      date: LocalDateSchema,
      name: z.string(),
      from: HhMmSchema.optional(),
      scope: z.enum(["STATEWIDE", "REGIONAL"]),
    }),
  ),
  /** Calendar years the list covers; dates outside them return no holidays. */
  coveredYears: z.array(z.number().int()),
  source: z.string(),
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
export type PublicHolidaysQuery = z.infer<typeof PublicHolidaysQuerySchema>;
export type PublicHolidaysResponse = z.infer<typeof PublicHolidaysResponseSchema>;
export type LeaveEntry = z.infer<typeof LeaveEntrySchema>;
export type AllowanceClaims = z.infer<typeof AllowanceClaimsSchema>;
export type AuditPublicHoliday = z.infer<typeof AuditPublicHolidaySchema>;
