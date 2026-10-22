import { z } from "zod";

import {
  IdSchema,
  InstantSchema,
  LocalDateSchema,
  LocalDateTimeSchema,
  PageQuerySchema,
  UtcOffsetMinutesSchema,
} from "./common.js";

export const BreakSchema = z.strictObject({
  kind: z.enum(["UNPAID_MEAL", "PAID_REST"]),
  start: LocalDateTimeSchema,
  end: LocalDateTimeSchema,
  startUtcOffsetMinutes: UtcOffsetMinutesSchema.optional(),
  endUtcOffsetMinutes: UtcOffsetMinutesSchema.optional(),
});

const shiftTimes = {
  start: LocalDateTimeSchema,
  end: LocalDateTimeSchema,
  startUtcOffsetMinutes: UtcOffsetMinutesSchema.optional(),
  endUtcOffsetMinutes: UtcOffsetMinutesSchema.optional(),
  breaks: z.array(BreakSchema).max(10),
};

export const CreateShiftRequestSchema = z.strictObject({ employmentId: IdSchema, ...shiftTimes });

/**
 * Full replacement of a shift's times and breaks. `employmentId` cannot be changed: a shift is
 * never reassigned. `version` is required for optimistic concurrency.
 */
export const UpdateShiftRequestSchema = z.strictObject({ version: z.number().int().min(1), ...shiftTimes });

export const ShiftResponseSchema = z.strictObject({
  id: IdSchema,
  employmentId: IdSchema,
  start: LocalDateTimeSchema,
  end: LocalDateTimeSchema,
  startUtcOffsetMinutes: z.number().int().nullable(),
  endUtcOffsetMinutes: z.number().int().nullable(),
  startAt: InstantSchema,
  endAt: InstantSchema,
  breaks: z.array(BreakSchema),
  version: z.number().int(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

export const ListShiftsQuerySchema = PageQuerySchema.extend({
  employmentId: IdSchema.optional(),
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  /** Allow-listed sort orders only; never interpolated into SQL. */
  sort: z.enum(["start_asc", "start_desc"]).default("start_asc"),
});

export const ImportShiftsQuerySchema = z.strictObject({ employmentId: IdSchema });

export const ImportShiftsResponseSchema = z.strictObject({
  imported: z.number().int(),
  shifts: z.array(ShiftResponseSchema),
});

export type CreateShiftRequest = z.infer<typeof CreateShiftRequestSchema>;
export type UpdateShiftRequest = z.infer<typeof UpdateShiftRequestSchema>;
export type ShiftResponse = z.infer<typeof ShiftResponseSchema>;
export type ListShiftsQuery = z.infer<typeof ListShiftsQuerySchema>;
export type ImportShiftsResponse = z.infer<typeof ImportShiftsResponseSchema>;
