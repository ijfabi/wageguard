import { z } from "zod";

import { IdSchema, InstantSchema, LIMITS, LocalDateSchema, WeekdaySchema } from "./common.js";

export const DeclarationsSchema = z.strictObject({
  awardCoverage: z.enum(["CONFIRMED", "UNSURE"]),
  enterpriseAgreement: z.enum(["NONE", "APPLIES", "UNSURE"]),
  ageBand: z.enum(["ADULT_21_PLUS", "UNDER_21", "UNSURE"]),
  shiftworker: z.enum(["NO", "YES", "UNSURE"]),
});

export const AustralianStateSchema = z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]);
export const SpanExceptionSchema = z.enum(["NONE", "NEWSAGENCY", "VIDEO_SHOP", "EXTENDED_TRADING"]);

/** Facts about the job that change how pay is worked out (MA000004 cl. 11.3, 15.2, 15.6, 16.6, 24.2). */
export const WorkConditionsSchema = z.strictObject({
  /** cl. 15.2: ordinary hours start earlier or run later at some workplaces. */
  spanException: SpanExceptionSchema,
  /** cl. 11.3: casual full-time secondary school student (1.5-hour engagement after school). */
  schoolStudent: z.boolean(),
  /** cl. 16.6(d): a 10-hour break between work days has been agreed. */
  reducedBreakAgreed: z.boolean(),
  /** cl. 15.6(g): hours average 38 over a roster cycle longer than a week. */
  averagingRoster: z.boolean(),
  /** cl. 24.2: baking production employee (not calculated). */
  bakingProduction: z.boolean(),
  /** Apprentice or trainee (not calculated). */
  apprentice: z.boolean(),
});

/** cl. 19: allowances that depend on the job rather than on a particular pay period. */
export const AllowanceDeclarationsSchema = z.strictObject({
  laundersSpecialClothing: z.boolean(),
  appointedFirstAider: z.boolean(),
  holdsLiquorLicence: z.boolean(),
  brokenHill: z.boolean(),
});

export const DEFAULT_WORK_CONDITIONS: z.infer<typeof WorkConditionsSchema> = {
  spanException: "NONE",
  schoolStudent: false,
  reducedBreakAgreed: false,
  averagingRoster: false,
  bakingProduction: false,
  apprentice: false,
};
export const DEFAULT_ALLOWANCES: z.infer<typeof AllowanceDeclarationsSchema> = {
  laundersSpecialClothing: false,
  appointedFirstAider: false,
  holdsLiquorLicence: false,
  brokenHill: false,
};

const EmploymentFields = z.strictObject({
  label: z.string().trim().min(1).max(LIMITS.maxLabelLength),
  awardCode: z.string().regex(/^MA\d{6}$/),
  classificationCode: z.string().regex(/^[A-Z0-9_]{1,100}$/),
  employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
  /** Where the work is done: decides which public holidays apply. */
  state: AustralianStateSchema,
  timeZone: z.string().min(1).max(64),
  declarations: DeclarationsSchema,
  partTimeGuaranteedMinutes: z.partialRecord(WeekdaySchema, z.number().int().min(0).max(1440)).optional(),
  dateOfBirth: LocalDateSchema.optional(),
  employmentStartDate: LocalDateSchema.optional(),
  conditions: WorkConditionsSchema.optional(),
  allowances: AllowanceDeclarationsSchema.optional(),
});

const refineEmployment = (value: z.infer<typeof EmploymentFields>, ctx: z.RefinementCtx) => {
  if (value.partTimeGuaranteedMinutes !== undefined && value.employmentType !== "PART_TIME") {
    ctx.addIssue({
      code: "custom",
      message: "Guaranteed hours only apply to part-time employment",
      path: ["partTimeGuaranteedMinutes"],
    });
  }
  if (value.conditions?.schoolStudent === true && value.employmentType !== "CASUAL") {
    ctx.addIssue({
      code: "custom",
      message: "The school student engagement only applies to casual employees",
      path: ["conditions", "schoolStudent"],
    });
  }
  if (
    value.dateOfBirth !== undefined &&
    value.employmentStartDate !== undefined &&
    value.dateOfBirth >= value.employmentStartDate
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Employment must start after the date of birth",
      path: ["employmentStartDate"],
    });
  }
};

export const CreateEmploymentRequestSchema = EmploymentFields.superRefine(refineEmployment);
/** Replaces every editable field. Past audits keep the terms they were calculated with. */
export const UpdateEmploymentRequestSchema = EmploymentFields.superRefine(refineEmployment);

export const EmploymentResponseSchema = z.strictObject({
  id: IdSchema,
  label: z.string(),
  awardCode: z.string(),
  classificationCode: z.string(),
  employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
  /** Null for employments created before the state was recorded. */
  state: AustralianStateSchema.nullable(),
  timeZone: z.string(),
  declarations: DeclarationsSchema,
  partTimeGuaranteedMinutes: z.partialRecord(WeekdaySchema, z.number().int()).nullable(),
  dateOfBirth: LocalDateSchema.nullable(),
  employmentStartDate: LocalDateSchema.nullable(),
  conditions: WorkConditionsSchema,
  allowances: AllowanceDeclarationsSchema,
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

export type CreateEmploymentRequest = z.infer<typeof CreateEmploymentRequestSchema>;
export type UpdateEmploymentRequest = z.infer<typeof UpdateEmploymentRequestSchema>;
export type EmploymentResponse = z.infer<typeof EmploymentResponseSchema>;
export type AustralianState = z.infer<typeof AustralianStateSchema>;
export type WorkConditions = z.infer<typeof WorkConditionsSchema>;
export type AllowanceDeclarations = z.infer<typeof AllowanceDeclarationsSchema>;
