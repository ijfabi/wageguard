import { z } from "zod";

/** Limits that bound request size and work per request. Not award rules. */
export const LIMITS = {
  maxPageSize: 100,
  defaultPageSize: 25,
  maxLabelLength: 100,
  maxIdempotencyKeyLength: 100,
  maxCsvBytes: 256 * 1024,
  maxCsvRows: 500,
  maxJsonBodyBytes: 512 * 1024,
} as const;

export const IdSchema = z.uuid();
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const LocalDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Expected YYYY-MM-DDTHH:MM");
export const MoneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Expected a non-negative amount with up to 2 decimals");
export const SignedMoneySchema = z.string().regex(/^-?\d{1,12}\.\d{2}$/);
export const InstantSchema = z.iso.datetime({ offset: true });
export const UtcOffsetMinutesSchema = z
  .number()
  .int()
  .min(-14 * 60)
  .max(14 * 60);
export const WeekdaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

export const PayPeriodSchema = z.strictObject({ startDate: LocalDateSchema, endDate: LocalDateSchema });

/** Opaque cursor pagination. Cursors are produced by the server; clients must not construct them. */
export const PageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(LIMITS.defaultPageSize),
  cursor: z.string().max(200).optional(),
});

export function pageOf<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const ErrorIssueSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});

/** Every error response has this shape. */
export const ErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    issues: z.array(ErrorIssueSchema).optional(),
    correlationId: z.string(),
  }),
});

export type ErrorBody = z.infer<typeof ErrorBodySchema>;
export type PayPeriod = z.infer<typeof PayPeriodSchema>;

/** Stable error codes returned by the API (domain issue codes appear inside `issues`). */
export const ApiErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  FORBIDDEN_ORIGIN: "FORBIDDEN_ORIGIN",
  NOT_FOUND: "NOT_FOUND",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  SHIFT_OVERLAP: "SHIFT_OVERLAP",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_READY: "NOT_READY",
  /** A dependency (the database) is temporarily unreachable; retry after the Retry-After delay. */
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
