import {
  DomainError,
  DomainErrorCode,
  DomainValidationError,
  LocalDate,
  LocalDateTime,
  PayPeriod,
  TimeZone,
  WEEKDAYS,
  createEmploymentTerms,
  resolveShift,
  type DomainIssue,
  type EmploymentTerms,
  type ResolvedShift,
  type ShiftRecord,
  type Weekday,
} from "@wageguard/domain";
import { z } from "zod";

/** Sanity limits that bound work per request; not award rules. */
export const INPUT_LIMITS = {
  maxShiftsPerPeriod: 200,
  maxBreaksPerShift: 10,
  maxIdLength: 100,
} as const;

const id = z.string().trim().min(1).max(INPUT_LIMITS.maxIdLength);
const offsetMinutes = z
  .number()
  .int()
  .min(-14 * 60)
  .max(14 * 60);

export const BreakInputSchema = z.strictObject({
  kind: z.enum(["UNPAID_MEAL", "PAID_REST"]),
  start: z.string().max(16),
  end: z.string().max(16),
  startUtcOffsetMinutes: offsetMinutes.optional(),
  endUtcOffsetMinutes: offsetMinutes.optional(),
});

export const ShiftInputSchema = z.strictObject({
  id,
  /** Wall-clock "YYYY-MM-DDTHH:MM" in the employment's time zone. */
  start: z.string().max(16),
  end: z.string().max(16),
  startUtcOffsetMinutes: offsetMinutes.optional(),
  endUtcOffsetMinutes: offsetMinutes.optional(),
  breaks: z.array(BreakInputSchema).max(INPUT_LIMITS.maxBreaksPerShift),
});

export const EmploymentInputSchema = z.strictObject({
  employmentId: id,
  awardCode: z.string().max(20),
  classificationCode: z.string().max(100),
  employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]),
  timeZone: z.string().max(64),
  declarations: z.strictObject({
    awardCoverage: z.enum(["CONFIRMED", "UNSURE"]),
    enterpriseAgreement: z.enum(["NONE", "APPLIES", "UNSURE"]),
    ageBand: z.enum(["ADULT_21_PLUS", "UNDER_21", "UNSURE"]),
    shiftworker: z.enum(["NO", "YES", "UNSURE"]),
  }),
  /** Part-time guaranteed minutes per weekday (cl. 10.5(a)); omit for casual employees. */
  partTimeGuaranteedMinutes: z.partialRecord(z.enum(WEEKDAYS), z.number().int().min(0).max(1440)).optional(),
});

export const PayPeriodCalculationInputSchema = z.strictObject({
  employment: EmploymentInputSchema,
  payPeriod: z.strictObject({ startDate: z.string().max(10), endDate: z.string().max(10) }),
  shifts: z.array(ShiftInputSchema).max(INPUT_LIMITS.maxShiftsPerPeriod),
  /** Local dates the user declares to be public holidays where they work. Never inferred. */
  declaredPublicHolidays: z.array(z.string().max(10)).max(31).optional(),
});

export type BreakInput = z.infer<typeof BreakInputSchema>;
export type ShiftInput = z.infer<typeof ShiftInputSchema>;
export type EmploymentInput = z.infer<typeof EmploymentInputSchema>;
export type PayPeriodCalculationInput = z.infer<typeof PayPeriodCalculationInputSchema>;

export interface ParsedCalculationInput {
  readonly employment: EmploymentTerms;
  readonly payPeriod: PayPeriod;
  /** Sorted by start instant, then id. */
  readonly shifts: readonly ResolvedShift[];
  readonly publicHolidays: ReadonlySet<string>;
  /** The input in canonical order: the basis of the input snapshot hash. */
  readonly normalised: PayPeriodCalculationInput;
}

/**
 * Parses and validates raw (JSON) input. Structural problems and every domain-level problem
 * (invalid dates, DST-ambiguous times, overlapping shifts, shifts outside the period...) are
 * collected and thrown together as one {@link DomainValidationError}. Input is never mutated.
 */
export function parseCalculationInput(raw: unknown): ParsedCalculationInput {
  const structural = PayPeriodCalculationInputSchema.safeParse(raw);
  if (!structural.success) {
    throw new DomainValidationError(
      structural.error.issues.map((issue) => ({
        code: DomainErrorCode.INVALID_INPUT,
        message: issue.message,
        path: issue.path.join("."),
      })),
    );
  }
  const input = structural.data;
  const issues: DomainIssue[] = [];
  const attempt = <T>(fn: () => T): T | null => {
    try {
      return fn();
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        issues.push(error.toIssue());
        return null;
      }
      if (error instanceof DomainValidationError) {
        issues.push(...error.issues);
        return null;
      }
      throw error;
    }
  };

  const zone = attempt(() => TimeZone.of(input.employment.timeZone, "employment.timeZone"));
  const employment = zone === null ? null : attempt(() => toEmploymentTerms(input.employment, zone));
  const payPeriod = attempt(() =>
    PayPeriod.of(
      LocalDate.parse(input.payPeriod.startDate, "payPeriod.startDate"),
      LocalDate.parse(input.payPeriod.endDate, "payPeriod.endDate"),
    ),
  );

  const resolved: ResolvedShift[] = [];
  if (zone !== null) {
    input.shifts.forEach((shift, index) => {
      const result = attempt(() =>
        resolveShift(toShiftRecord(shift, `shifts[${index}]`), zone, `shifts[${index}]`),
      );
      if (result !== null) {
        resolved.push(result);
      }
    });
  }
  resolved.sort(compareShifts);

  issues.push(...duplicateIdIssues(input.shifts));
  issues.push(...overlapIssues(resolved));
  if (payPeriod !== null) {
    issues.push(...outsidePeriodIssues(resolved, payPeriod));
  }

  const holidays = new Set<string>();
  (input.declaredPublicHolidays ?? []).forEach((value, index) => {
    const date = attempt(() => LocalDate.parse(value, `declaredPublicHolidays[${index}]`));
    if (date !== null && payPeriod !== null && !payPeriod.containsDate(date)) {
      issues.push({
        code: DomainErrorCode.INVALID_INPUT,
        message: `Declared public holiday ${value} is outside the pay period`,
        path: `declaredPublicHolidays[${index}]`,
      });
    }
    if (date !== null) {
      holidays.add(date.toString());
    }
  });

  if (issues.length > 0 || employment === null || payPeriod === null) {
    throw new DomainValidationError(issues);
  }

  return {
    employment,
    payPeriod,
    shifts: resolved,
    publicHolidays: holidays,
    normalised: normalise(input, resolved, holidays),
  };
}

function toEmploymentTerms(input: EmploymentInput, zone: TimeZone): EmploymentTerms {
  const guaranteed = input.partTimeGuaranteedMinutes;
  return createEmploymentTerms({
    employmentId: input.employmentId,
    awardCode: input.awardCode,
    classificationCode: input.classificationCode,
    employmentType: input.employmentType,
    timeZone: zone,
    declarations: input.declarations,
    partTimeGuaranteedMinutes:
      guaranteed === undefined
        ? null
        : new Map(Object.entries(guaranteed).map(([day, minutes]) => [day as Weekday, minutes])),
  });
}

function toShiftRecord(input: ShiftInput, path: string): ShiftRecord {
  return {
    id: input.id,
    start: LocalDateTime.parse(input.start, `${path}.start`),
    end: LocalDateTime.parse(input.end, `${path}.end`),
    ...(input.startUtcOffsetMinutes === undefined
      ? {}
      : { startUtcOffsetMinutes: input.startUtcOffsetMinutes }),
    ...(input.endUtcOffsetMinutes === undefined ? {} : { endUtcOffsetMinutes: input.endUtcOffsetMinutes }),
    breaks: input.breaks.map((b, i) => ({
      kind: b.kind,
      start: LocalDateTime.parse(b.start, `${path}.breaks[${i}].start`),
      end: LocalDateTime.parse(b.end, `${path}.breaks[${i}].end`),
      ...(b.startUtcOffsetMinutes === undefined ? {} : { startUtcOffsetMinutes: b.startUtcOffsetMinutes }),
      ...(b.endUtcOffsetMinutes === undefined ? {} : { endUtcOffsetMinutes: b.endUtcOffsetMinutes }),
    })),
  };
}

function compareShifts(a: ResolvedShift, b: ResolvedShift): number {
  const byStart = a.interval.start.compare(b.interval.start);
  if (byStart !== 0) {
    return byStart;
  }
  return a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0;
}

function duplicateIdIssues(shifts: readonly ShiftInput[]): DomainIssue[] {
  const seen = new Set<string>();
  const issues: DomainIssue[] = [];
  shifts.forEach((shift, index) => {
    if (seen.has(shift.id)) {
      issues.push({
        code: DomainErrorCode.INVALID_SHIFT,
        message: `Duplicate shift id ${shift.id}`,
        path: `shifts[${index}].id`,
      });
    }
    seen.add(shift.id);
  });
  return issues;
}

/** Shifts for one employment cannot overlap (touching end/start is allowed: intervals are half-open). */
function overlapIssues(sorted: readonly ResolvedShift[]): DomainIssue[] {
  const issues: DomainIssue[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1] as ResolvedShift;
    const current = sorted[i] as ResolvedShift;
    if (previous.interval.overlaps(current.interval)) {
      issues.push({
        code: DomainErrorCode.OVERLAPPING_SHIFTS,
        message: `Shift ${current.record.id} overlaps shift ${previous.record.id}`,
        path: `shifts.${current.record.id}`,
      });
    }
  }
  return issues;
}

/** A shift belongs to the pay period in which it starts. */
function outsidePeriodIssues(shifts: readonly ResolvedShift[], period: PayPeriod): DomainIssue[] {
  return shifts
    .filter((s) => !period.containsDate(s.record.start.date))
    .map((s) => ({
      code: DomainErrorCode.SHIFT_OUTSIDE_PAY_PERIOD,
      message: `Shift ${s.record.id} starts on ${s.record.start.date.toString()}, outside the pay period`,
      path: `shifts.${s.record.id}`,
    }));
}

function normalise(
  input: PayPeriodCalculationInput,
  sorted: readonly ResolvedShift[],
  holidays: ReadonlySet<string>,
): PayPeriodCalculationInput {
  const byId = new Map(input.shifts.map((s) => [s.id, s]));
  const shifts = sorted.map((resolved) => {
    const original = byId.get(resolved.record.id) as ShiftInput;
    return {
      ...original,
      breaks: [...original.breaks].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)),
    };
  });
  return { ...input, shifts, declaredPublicHolidays: [...holidays].sort() };
}
