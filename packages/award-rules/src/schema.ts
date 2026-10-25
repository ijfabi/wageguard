import { z } from "zod";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Expected HH:MM (24:00 allowed as end of day)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Expected a non-negative decimal string");
const money2dp = z.string().regex(/^\d+\.\d{2}$/, "Expected a 2dp amount");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const versionId = z.string().regex(/^MA\d{6}\/\d{4}-\d{2}-\d{2}\/r\d+$/);

export const WeekdaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export const EmploymentTypeSchema = z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]);
export const RoundingModeSchema = z.enum(["HALF_UP", "HALF_EVEN", "DOWN", "UP"]);
/** cl. 15.2: places where ordinary hours may be worked outside the standard span. */
export const SpanExceptionSchema = z.enum(["NEWSAGENCY", "VIDEO_SHOP", "EXTENDED_TRADING"]);

/** Exact location of the provision in the source document, plus the words relied on. */
export const SourceReferenceSchema = z.object({
  clause: z.string().min(1),
  table: z.string().optional(),
  /** Verbatim excerpt from the retrieved source document. */
  excerpt: z.string().min(1),
});

/**
 * Verification is tracked honestly and separately:
 * - TRANSCRIBED_FROM_SOURCE: the value was copied from the retrieved official document and
 *   cross-checked by automated tests (e.g. against Schedule B published dollar amounts).
 * - DERIVED_FROM_SOURCE: not stated as a number in the award, but derived from its words by a
 *   method recorded in `notes` (for example, adding the cl. 11.1 casual loading to a rate the
 *   award states only for full-time and part-time employees).
 * - UNVERIFIED: not confirmed against a source; the rule must be DISABLED.
 * Human review by a qualified payroll/legal reviewer is a separate flag and is PENDING until done.
 */
export const VerificationSchema = z.object({
  status: z.enum(["TRANSCRIBED_FROM_SOURCE", "DERIVED_FROM_SOURCE", "UNVERIFIED"]),
  humanReview: z.enum(["PENDING", "REVIEWED"]),
  notes: z.string().optional(),
});

const WeeklyWindowCondition = z.object({
  kind: z.literal("WEEKLY_WINDOW"),
  days: z.array(WeekdaySchema).min(1),
  /** Local wall-clock window [from, to), interpreted in the employment's time zone. */
  from: hhmm,
  to: hhmm,
});
const PublicHolidayCondition = z.object({ kind: z.literal("PUBLIC_HOLIDAY") });
const OvertimeCondition = z.object({
  kind: z.literal("OVERTIME"),
  /** Human-readable trigger, as the award words it. */
  trigger: z.string().min(1),
  /** Days this overtime rate applies to (not public holidays). */
  days: z.array(WeekdaySchema).min(1).optional(),
  /** True for the public holiday overtime rate, which applies whatever the weekday. */
  publicHoliday: z.boolean().optional(),
  /** Overtime minutes already worked that day before this rate starts ("after 3 hours" = 180). */
  fromOvertimeMinute: z.number().int().min(0).optional(),
  /** Overtime minutes worked that day after which this rate stops ("first 3 hours" = 180). */
  untilOvertimeMinute: z.number().int().positive().optional(),
});
/** Part 6: every minute of a shiftwork shift on the listed days (cl. 25.1). */
const ShiftworkCondition = z.object({ kind: z.literal("SHIFTWORK"), days: z.array(WeekdaySchema).min(1) });
/** cl. 16.6(b): work before the employee has had the required break between work days. */
const InsufficientBreakCondition = z.object({ kind: z.literal("INSUFFICIENT_BREAK") });

export const RateRuleSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9]+(\.[A-Z0-9_]+)+$/, "Rule ids look like MA000004.ORD.WEEKDAY"),
    description: z.string().min(1),
    category: z.enum([
      "ORDINARY",
      "PENALTY",
      "PUBLIC_HOLIDAY",
      "OVERTIME",
      "SHIFTWORK",
      "BREAK_BETWEEN_WORK_DAYS",
    ]),
    status: z.enum(["ENABLED", "DISABLED"]),
    disabledReason: z.string().optional(),
    appliesTo: z.object({
      classifications: z.array(z.string().min(1)).min(1),
      employmentTypes: z.array(EmploymentTypeSchema).min(1),
      /** When present, the rule only applies to employment under one of these cl. 15.2 exceptions. */
      spanExceptions: z.array(SpanExceptionSchema).min(1).optional(),
    }),
    when: z.discriminatedUnion("kind", [
      WeeklyWindowCondition,
      PublicHolidayCondition,
      OvertimeCondition,
      ShiftworkCondition,
      InsufficientBreakCondition,
    ]),
    /**
     * Percentage of the classification's minimum hourly rate, per employment type. For casual
     * employees the award's percentages are stated "inclusive of casual loading", so the engine
     * never adds the 25% loading on top of these values.
     */
    percentOfMinimumHourlyRate: z.partialRecord(EmploymentTypeSchema, decimalString),
    casualLoadingIncluded: z.literal(true),
    /** Higher wins when two enabled rules match the same minute. Ties are rejected at load time. */
    precedence: z.number().int().min(0),
    sources: z.array(SourceReferenceSchema).min(1),
    verification: VerificationSchema,
  })
  .superRefine((rule, ctx) => {
    for (const type of rule.appliesTo.employmentTypes) {
      if (rule.percentOfMinimumHourlyRate[type] === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `Missing percentage for ${type}`,
          path: ["percentOfMinimumHourlyRate"],
        });
      }
    }
    if (
      rule.status === "DISABLED" &&
      (rule.disabledReason === undefined || rule.disabledReason.trim() === "")
    ) {
      ctx.addIssue({ code: "custom", message: "Disabled rules must state why", path: ["disabledReason"] });
    }
    if (rule.status === "ENABLED" && rule.verification.status === "UNVERIFIED") {
      ctx.addIssue({
        code: "custom",
        message: "Only source-verified rules may be enabled",
        path: ["status"],
      });
    }
    if (
      rule.verification.status === "DERIVED_FROM_SOURCE" &&
      (rule.verification.notes === undefined || rule.verification.notes.trim() === "")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Derived rules must record how they were derived",
        path: ["verification", "notes"],
      });
    }
    if (rule.status === "ENABLED" && rule.when.kind === "OVERTIME") {
      const structured = rule.when.publicHoliday === true || rule.when.days !== undefined;
      if (!structured) {
        ctx.addIssue({
          code: "custom",
          message: "Enabled overtime rules must say which days or public holidays they cover",
          path: ["when"],
        });
      }
    }
    if (rule.when.kind === "WEEKLY_WINDOW" && rule.when.to <= rule.when.from) {
      ctx.addIssue({ code: "custom", message: "Window must end after it starts", path: ["when", "to"] });
    }
  });

export const ClassificationRateSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  minimumHourlyRate: money2dp,
  minimumWeeklyRate: money2dp,
  /** cl. 17.2: junior percentages apply to this classification. */
  juniorRatesApply: z.boolean().optional(),
  sources: z.array(SourceReferenceSchema).min(1),
});

/** A numeric limit taken from the award, with the clause it comes from. */
const ConstraintSchema = z.object({
  minutes: z.number().int().positive(),
  description: z.string().min(1),
  sources: z.array(SourceReferenceSchema).min(1),
});

/** cl. 11.3: the shorter casual engagement for secondary school students after school. */
const SchoolStudentEngagementSchema = ConstraintSchema.extend({
  days: z.array(WeekdaySchema).min(1),
  from: hhmm,
  to: hhmm,
});

/** cl. 17.2 Table 5. `age: null` is "under 16". */
const JuniorBandSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]+$/),
  age: z.number().int().min(16).max(20).nullable(),
  /** Only for the age-20 rows, which depend on how long the employee has been employed. */
  employed: z.enum(["SIX_MONTHS_OR_LESS", "MORE_THAN_SIX_MONTHS"]).optional(),
  percent: decimalString,
});

const JuniorRatesSchema = z.object({
  /** Age below which an employee is a junior (cl. 2). */
  adultFromAge: z.number().int().positive(),
  /**
   * How a junior hourly rate is formed. WEEKLY_PERCENT_DIVIDED_BY_HOURS: the full-time weekly rate
   * times the junior percentage, divided by `weeklyHours`, rounded per the hourly-rate policy.
   */
  hourlyBasis: z.literal("WEEKLY_PERCENT_DIVIDED_BY_HOURS"),
  weeklyHours: z.number().int().positive(),
  bands: z.array(JuniorBandSchema).min(1),
  sources: z.array(SourceReferenceSchema).min(1),
  verification: VerificationSchema,
});

export const AllowanceSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]+(\.[A-Z0-9_]+)+$/),
  description: z.string().min(1),
  amount: money2dp,
  unit: z.enum(["PER_WEEK", "PER_SHIFT", "PER_HOUR", "PER_KILOMETRE", "PER_OCCASION"]),
  /**
   * What the quantity is counted from:
   * - *_WEEKS: weeks with work, when the employment declaration holds;
   * - LAUNDRY_SHIFTS: shifts worked, when the employee launders special clothing;
   * - *_HOURS: hours claimed for the pay period (cold work) or worked (Broken Hill);
   * - VEHICLE_KILOMETRES: kilometres claimed;
   * - MEAL_OVERTIME_OVER_*: claimed dates with more than 1 or 4 hours of overtime.
   */
  basis: z.enum([
    "LAUNDRY_WEEKS",
    "LAUNDRY_SHIFTS",
    "COLD_WORK_HOURS",
    "BELOW_ZERO_HOURS",
    "FIRST_AID_WEEKS",
    "LIQUOR_LICENCE_WEEKS",
    "BROKEN_HILL_HOURS",
    "VEHICLE_KILOMETRES",
    "MEAL_OVERTIME_OVER_1H",
    "MEAL_OVERTIME_OVER_4H",
  ]),
  employmentTypes: z.array(EmploymentTypeSchema).min(1),
  sources: z.array(SourceReferenceSchema).min(1),
  verification: VerificationSchema,
});

const LeaveSchema = z.object({
  /** cl. 28.3(c)(i): the minimum annual leave loading, as a percentage of the minimum hourly rate. */
  annualLeaveLoadingPercent: decimalString,
  /** Employment types that can take paid leave (casuals cannot). */
  paidLeaveEmploymentTypes: z.array(EmploymentTypeSchema).min(1),
  sources: z.array(SourceReferenceSchema).min(1),
});

/** Part 6 shiftwork: when a shift counts as shiftwork. */
const ShiftworkDefinitionSchema = z.object({
  /** A shift starting at or after this time... */
  startsAtOrAfter: hhmm,
  /** ...or before this time (on the following day) is shiftwork (cl. 24.1). */
  startsBefore: hhmm,
  /** cl. 26: rest and meal breaks taken by shiftworkers are paid. */
  breaksPaid: z.boolean(),
  sources: z.array(SourceReferenceSchema).min(1),
});

export const AwardRuleSetSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  awardCode: z.string().regex(/^MA\d{6}$/),
  awardTitle: z.string().min(1),
  /** Immutable identifier. A correction produces a new revision (r2), never an edit of r1. */
  version: versionId,
  /** The revision this one replaces for exactly the same effective period. */
  supersedes: versionId.optional(),
  effective: z.object({
    /**
     * MA000004 variations apply from the first full pay period commencing on or after the date
     * ("ppc"), so a rule set is selected by the pay period's start date, not by each shift's date.
     */
    basis: z.literal("FIRST_FULL_PAY_PERIOD_ON_OR_AFTER"),
    from: isoDate,
    /** Exclusive. Null while this is the latest known rule set. */
    until: isoDate.nullable(),
  }),
  source: z.object({
    documentTitle: z.string().min(1),
    url: z.url(),
    consolidatedAsAt: isoDate,
    retrievedOn: isoDate,
    documentSha256: sha256,
    variationRefs: z.array(z.string()),
  }),
  supportedScope: z.object({
    classifications: z.array(z.string()).min(1),
    employmentTypes: z.array(EmploymentTypeSchema).min(1),
    timeZonePrefix: z.string().min(1),
    /** cl. 15.2 exceptions this rule set models. Absent: none. */
    spanExceptions: z.array(SpanExceptionSchema).optional(),
    /** Whether Part 6 shiftwork is modelled. Absent: no. */
    shiftwork: z.boolean().optional(),
    notes: z.array(z.string()),
  }),
  classifications: z.array(ClassificationRateSchema).min(1),
  rateRules: z.array(RateRuleSchema).min(1),
  constraints: z.object({
    minimumEngagement: z.partialRecord(EmploymentTypeSchema, ConstraintSchema),
    maxOrdinaryPerDay: ConstraintSchema,
    casualWeeklyOrdinary: ConstraintSchema,
    minimumBreakBetweenWorkDays: ConstraintSchema,
    mealBreakRequiredAfter: ConstraintSchema,
    /** cl. 15.5: the one longer day allowed each week. */
    maxOrdinaryOneDayPerWeek: ConstraintSchema.optional(),
    /** cl. 9, Table 10: full-time ordinary hours per week. */
    fullTimeWeeklyOrdinary: ConstraintSchema.optional(),
    /** Table 11: the length of the first overtime tier on Monday to Saturday. */
    overtimeFirstTier: ConstraintSchema.optional(),
    /** cl. 16.6(d): the shorter break between work days that may be agreed. */
    agreedBreakBetweenWorkDays: ConstraintSchema.optional(),
    /** cl. 11.3: the shorter engagement for eligible school students. */
    schoolStudentEngagement: SchoolStudentEngagementSchema.optional(),
    /** cl. 16.2 Table 3: shifts this long are entitled to at least one paid rest break. */
    paidRestBreakFrom: ConstraintSchema.optional(),
  }),
  juniorRates: JuniorRatesSchema.optional(),
  shiftwork: ShiftworkDefinitionSchema.optional(),
  allowances: z.array(AllowanceSchema).optional(),
  leave: LeaveSchema.optional(),
  roundingPolicy: z.object({
    hourlyRate: z.object({ decimalPlaces: z.literal(2), mode: RoundingModeSchema }),
    lineAmount: z.object({ decimalPlaces: z.literal(2), mode: RoundingModeSchema }),
    aggregation: z.literal("ROUND_PER_RULE_LINE_PER_PERIOD"),
    rationale: z.string().min(1),
  }),
});

export type AwardRuleSet = z.infer<typeof AwardRuleSetSchema>;
export type RateRule = z.infer<typeof RateRuleSchema>;
export type ClassificationRate = z.infer<typeof ClassificationRateSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type RuleConstraint = z.infer<typeof ConstraintSchema>;
export type Allowance = z.infer<typeof AllowanceSchema>;
export type JuniorRates = z.infer<typeof JuniorRatesSchema>;
export type SpanException = z.infer<typeof SpanExceptionSchema>;
export type WeeklyWindowRule = RateRule & { when: z.infer<typeof WeeklyWindowCondition> };
export type OvertimeRule = RateRule & { when: z.infer<typeof OvertimeCondition> };
export type ShiftworkRule = RateRule & { when: z.infer<typeof ShiftworkCondition> };
