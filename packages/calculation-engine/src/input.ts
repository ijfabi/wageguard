import {
  Decimal,
  DomainError,
  DomainErrorCode,
  DomainValidationError,
  LocalDate,
  LocalDateTime,
  LocalTime,
  NO_ALLOWANCES,
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
  /** Junior rates depend on age on each day worked (cl. 17.2). */
  dateOfBirth: z.string().max(10).optional(),
  /** 20-year-olds' rates depend on how long they have been employed (cl. 17.2 Table 5). */
  employmentStartDate: z.string().max(10).optional(),
  spanException: z.enum(["NONE", "NEWSAGENCY", "VIDEO_SHOP", "EXTENDED_TRADING"]).optional(),
  schoolStudent: z.boolean().optional(),
  reducedBreakAgreed: z.boolean().optional(),
  averagingRoster: z.boolean().optional(),
  bakingProduction: z.boolean().optional(),
  apprentice: z.boolean().optional(),
  allowances: z
    .strictObject({
      laundersSpecialClothing: z.boolean(),
      appointedFirstAider: z.boolean(),
      holdsLiquorLicence: z.boolean(),
      brokenHill: z.boolean(),
    })
    .optional(),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");
const decimal1dp = z.string().regex(/^\d{1,5}(\.\d)?$/, "Expected a number with at most one decimal place");

export const PublicHolidayInputSchema = z.strictObject({
  date: z.string().max(10),
  /** Part-day public holidays start at this local time, e.g. 19:00 on Christmas Eve in SA. */
  from: hhmm.optional(),
  name: z.string().max(120).optional(),
});

export const LeaveInputSchema = z.strictObject({
  kind: z.enum(["ANNUAL", "PERSONAL_CARERS", "COMPASSIONATE", "PUBLIC_HOLIDAY_NOT_WORKED"]),
  minutes: z
    .number()
    .int()
    .positive()
    .max(31 * 24 * 60),
});

/** Facts about the pay period that an allowance depends on (cl. 19). */
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
  vehicleKilometres: decimal1dp.optional(),
  /** Dates with overtime required without 24 hours' notice and no meal supplied (cl. 19.2). */
  mealAllowanceDates: z.array(z.string().max(10)).max(31).optional(),
});

export const PayPeriodCalculationInputSchema = z.strictObject({
  employment: EmploymentInputSchema,
  payPeriod: z.strictObject({ startDate: z.string().max(10), endDate: z.string().max(10) }),
  shifts: z.array(ShiftInputSchema).max(INPUT_LIMITS.maxShiftsPerPeriod),
  /** Local dates the user declares to be public holidays where they work (whole days). */
  declaredPublicHolidays: z.array(z.string().max(10)).max(31).optional(),
  /** Public holidays in force where the work was done, from a calendar the caller resolved. */
  publicHolidays: z.array(PublicHolidayInputSchema).max(31).optional(),
  /** Part-time: guaranteed hours varied in writing for a particular date (cl. 10.6). */
  guaranteedHoursVariations: z
    .array(z.strictObject({ date: z.string().max(10), minutes: z.number().int().min(0).max(1440) }))
    .max(31)
    .optional(),
  /**
   * Shifts worked in the 13 days before the pay period. Never priced: they only count towards
   * weekly hours and the break between work days.
   */
  contextShifts: z.array(ShiftInputSchema).max(INPUT_LIMITS.maxShiftsPerPeriod).optional(),
  allowanceClaims: AllowanceClaimsSchema.optional(),
  leave: z.array(LeaveInputSchema).max(10).optional(),
});

export type BreakInput = z.infer<typeof BreakInputSchema>;
export type ShiftInput = z.infer<typeof ShiftInputSchema>;
export type EmploymentInput = z.infer<typeof EmploymentInputSchema>;
export type PayPeriodCalculationInput = z.infer<typeof PayPeriodCalculationInputSchema>;
export type LeaveKind = z.infer<typeof LeaveInputSchema>["kind"];

/** How far back context shifts may reach: the rest of a Monday-to-Sunday week, plus the day before. */
const CONTEXT_DAYS = 13;

export interface ParsedPublicHoliday {
  /** Minute of the local day the holiday starts (0 for a whole day; 1140 for "from 7 pm"). */
  readonly fromMinute: number;
  readonly name: string | null;
}

export interface ParsedAllowanceClaims {
  readonly coldWorkMinutes: number;
  readonly belowZeroMinutes: number;
  readonly vehicleKilometres: Decimal;
  readonly mealAllowanceDates: ReadonlySet<string>;
}

export interface ParsedCalculationInput {
  readonly employment: EmploymentTerms;
  readonly payPeriod: PayPeriod;
  /** Sorted by start instant, then id. */
  readonly shifts: readonly ResolvedShift[];
  /** Sorted. Shifts before the pay period, counted for weekly hours and breaks, never priced. */
  readonly contextShifts: readonly ResolvedShift[];
  /** Local date -> holiday. Declared and calendar holidays merged; a whole day wins over a part day. */
  readonly publicHolidays: ReadonlyMap<string, ParsedPublicHoliday>;
  /** Local date -> varied guaranteed minutes (part-time, cl. 10.6). */
  readonly guaranteedHoursVariations: ReadonlyMap<string, number>;
  readonly allowanceClaims: ParsedAllowanceClaims;
  readonly leave: readonly { readonly kind: LeaveKind; readonly minutes: number }[];
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
  const invalid = (message: string, path: string) => {
    issues.push({ code: DomainErrorCode.INVALID_INPUT, message, path });
  };

  const zone = attempt(() => TimeZone.of(input.employment.timeZone, "employment.timeZone"));
  const employment = zone === null ? null : attempt(() => toEmploymentTerms(input.employment, zone));
  const payPeriod = attempt(() =>
    PayPeriod.of(
      LocalDate.parse(input.payPeriod.startDate, "payPeriod.startDate"),
      LocalDate.parse(input.payPeriod.endDate, "payPeriod.endDate"),
    ),
  );
  const inPeriod = (value: string, path: string): LocalDate | null => {
    const date = attempt(() => LocalDate.parse(value, path));
    if (date !== null && payPeriod !== null && !payPeriod.containsDate(date)) {
      invalid(`${value} is outside the pay period`, path);
    }
    return date;
  };

  const resolveAll = (shifts: readonly ShiftInput[], prefix: string): ResolvedShift[] => {
    const resolved: ResolvedShift[] = [];
    if (zone !== null) {
      shifts.forEach((shift, index) => {
        const result = attempt(() =>
          resolveShift(toShiftRecord(shift, `${prefix}[${index}]`), zone, `${prefix}[${index}]`),
        );
        if (result !== null) {
          resolved.push(result);
        }
      });
    }
    return resolved.sort(compareShifts);
  };
  const resolved = resolveAll(input.shifts, "shifts");
  const context = resolveAll(input.contextShifts ?? [], "contextShifts");

  issues.push(...duplicateIdIssues([...input.shifts, ...(input.contextShifts ?? [])]));
  issues.push(...overlapIssues([...context, ...resolved].sort(compareShifts)));
  if (payPeriod !== null) {
    issues.push(...outsidePeriodIssues(resolved, payPeriod));
    for (const shift of context) {
      const start = shift.record.start.date;
      if (!start.isBefore(payPeriod.startDate) || payPeriod.startDate.daysUntil(start) < -CONTEXT_DAYS) {
        invalid(
          `Context shift ${shift.record.id} must start within the ${CONTEXT_DAYS} days before the pay period`,
          `contextShifts.${shift.record.id}`,
        );
      }
    }
  }

  const holidays = new Map<string, ParsedPublicHoliday>();
  const addHoliday = (date: LocalDate | null, fromMinute: number, name: string | null) => {
    if (date === null) {
      return;
    }
    const key = date.toString();
    const existing = holidays.get(key);
    if (existing === undefined || fromMinute < existing.fromMinute) {
      holidays.set(key, { fromMinute, name: name ?? existing?.name ?? null });
    }
  };
  (input.declaredPublicHolidays ?? []).forEach((value, index) => {
    addHoliday(inPeriod(value, `declaredPublicHolidays[${index}]`), 0, null);
  });
  (input.publicHolidays ?? []).forEach((holiday, index) => {
    const path = `publicHolidays[${index}]`;
    const from =
      holiday.from === undefined
        ? 0
        : (attempt(() => LocalTime.parse(holiday.from as string, path))?.minuteOfDay ?? 0);
    addHoliday(inPeriod(holiday.date, `${path}.date`), from, holiday.name ?? null);
  });

  const variations = new Map<string, number>();
  (input.guaranteedHoursVariations ?? []).forEach((variation, index) => {
    const date = inPeriod(variation.date, `guaranteedHoursVariations[${index}].date`);
    if (date !== null) {
      variations.set(date.toString(), variation.minutes);
    }
  });
  if (variations.size > 0 && input.employment.employmentType !== "PART_TIME") {
    invalid("Guaranteed hours can only be varied for part-time employment", "guaranteedHoursVariations");
  }

  const claims = input.allowanceClaims ?? {};
  const mealDates = new Set<string>();
  (claims.mealAllowanceDates ?? []).forEach((value, index) => {
    const date = inPeriod(value, `allowanceClaims.mealAllowanceDates[${index}]`);
    if (date !== null) {
      mealDates.add(date.toString());
    }
  });
  if ((claims.belowZeroMinutes ?? 0) > (claims.coldWorkMinutes ?? 0)) {
    invalid(
      "Time below 0°C is part of cold work, so it cannot exceed it",
      "allowanceClaims.belowZeroMinutes",
    );
  }

  if (issues.length > 0 || employment === null || payPeriod === null) {
    throw new DomainValidationError(issues);
  }

  return {
    employment,
    payPeriod,
    shifts: resolved,
    contextShifts: context,
    publicHolidays: holidays,
    guaranteedHoursVariations: variations,
    allowanceClaims: {
      coldWorkMinutes: claims.coldWorkMinutes ?? 0,
      belowZeroMinutes: claims.belowZeroMinutes ?? 0,
      vehicleKilometres: new Decimal(claims.vehicleKilometres ?? "0"),
      mealAllowanceDates: mealDates,
    },
    leave: input.leave ?? [],
    normalised: normalise(input, resolved, context),
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
    dateOfBirth:
      input.dateOfBirth === undefined ? null : LocalDate.parse(input.dateOfBirth, "employment.dateOfBirth"),
    employmentStartDate:
      input.employmentStartDate === undefined
        ? null
        : LocalDate.parse(input.employmentStartDate, "employment.employmentStartDate"),
    spanException: input.spanException ?? "NONE",
    schoolStudent: input.schoolStudent ?? false,
    reducedBreakAgreed: input.reducedBreakAgreed ?? false,
    averagingRoster: input.averagingRoster ?? false,
    bakingProduction: input.bakingProduction ?? false,
    apprentice: input.apprentice ?? false,
    allowances: input.allowances ?? NO_ALLOWANCES,
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

/** Canonical order for hashing: shifts by start, breaks by start, lists sorted. */
function normalise(
  input: PayPeriodCalculationInput,
  sorted: readonly ResolvedShift[],
  context: readonly ResolvedShift[],
): PayPeriodCalculationInput {
  const byId = new Map([...input.shifts, ...(input.contextShifts ?? [])].map((s) => [s.id, s]));
  const ordered = (list: readonly ResolvedShift[]) =>
    list.map((resolved) => {
      const original = byId.get(resolved.record.id) as ShiftInput;
      return {
        ...original,
        breaks: [...original.breaks].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)),
      };
    });
  const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    ...input,
    shifts: ordered(sorted),
    declaredPublicHolidays: [...new Set(input.declaredPublicHolidays ?? [])].sort(byText),
    ...(input.contextShifts === undefined ? {} : { contextShifts: ordered(context) }),
    ...(input.publicHolidays === undefined
      ? {}
      : { publicHolidays: [...input.publicHolidays].sort((a, b) => byText(a.date, b.date)) }),
    ...(input.guaranteedHoursVariations === undefined
      ? {}
      : {
          guaranteedHoursVariations: [...input.guaranteedHoursVariations].sort((a, b) =>
            byText(a.date, b.date),
          ),
        }),
    ...(input.leave === undefined
      ? {}
      : { leave: [...input.leave].sort((a, b) => byText(a.kind, b.kind) || a.minutes - b.minutes) }),
    ...(input.allowanceClaims?.mealAllowanceDates === undefined
      ? {}
      : {
          allowanceClaims: {
            ...input.allowanceClaims,
            mealAllowanceDates: [...new Set(input.allowanceClaims.mealAllowanceDates)].sort(byText),
          },
        }),
  };
}
