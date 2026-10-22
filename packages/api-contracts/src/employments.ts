import { z } from "zod";

import { IdSchema, InstantSchema, LIMITS, WeekdaySchema } from "./common.js";

export const DeclarationsSchema = z.strictObject({
  awardCoverage: z.enum(["CONFIRMED", "UNSURE"]),
  enterpriseAgreement: z.enum(["NONE", "APPLIES", "UNSURE"]),
  ageBand: z.enum(["ADULT_21_PLUS", "UNDER_21", "UNSURE"]),
  shiftworker: z.enum(["NO", "YES", "UNSURE"]),
});

export const CreateEmploymentRequestSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(LIMITS.maxLabelLength),
    awardCode: z.string().regex(/^MA\d{6}$/),
    classificationCode: z.string().regex(/^[A-Z0-9_]{1,100}$/),
    employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
    timeZone: z.string().min(1).max(64),
    declarations: DeclarationsSchema,
    partTimeGuaranteedMinutes: z.partialRecord(WeekdaySchema, z.number().int().min(0).max(1440)).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.partTimeGuaranteedMinutes !== undefined && value.employmentType !== "PART_TIME") {
      ctx.addIssue({
        code: "custom",
        message: "Guaranteed hours only apply to part-time employment",
        path: ["partTimeGuaranteedMinutes"],
      });
    }
  });

export const EmploymentResponseSchema = z.strictObject({
  id: IdSchema,
  label: z.string(),
  awardCode: z.string(),
  classificationCode: z.string(),
  employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
  timeZone: z.string(),
  declarations: DeclarationsSchema,
  partTimeGuaranteedMinutes: z.partialRecord(WeekdaySchema, z.number().int()).nullable(),
  createdAt: InstantSchema,
});

export type CreateEmploymentRequest = z.infer<typeof CreateEmploymentRequestSchema>;
export type EmploymentResponse = z.infer<typeof EmploymentResponseSchema>;
