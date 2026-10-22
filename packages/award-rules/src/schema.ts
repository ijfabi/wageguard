import { z } from "zod";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Expected HH:MM (24:00 allowed as end of day)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Expected a non-negative decimal string");
const money2dp = z.string().regex(/^\d+\.\d{2}$/, "Expected a 2dp amount");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const WeekdaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export const EmploymentTypeSchema = z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]);
export const RoundingModeSchema = z.enum(["HALF_UP", "HALF_EVEN", "DOWN", "UP"]);

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
 * - UNVERIFIED: not confirmed against a source; the rule must be DISABLED.
 * Human review by a qualified payroll/legal reviewer is a separate flag and is PENDING until done.
 */
export const VerificationSchema = z.object({
  status: z.enum(["TRANSCRIBED_FROM_SOURCE", "UNVERIFIED"]),
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
  /** Human-readable trigger. Overtime is not computed by the MVP engine; rules are reference-only. */
  trigger: z.string().min(1),
});

export const RateRuleSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9]+(\.[A-Z0-9_]+)+$/, "Rule ids look like MA000004.ORD.WEEKDAY"),
    description: z.string().min(1),
    category: z.enum(["ORDINARY", "PENALTY", "PUBLIC_HOLIDAY", "OVERTIME"]),
    status: z.enum(["ENABLED", "DISABLED"]),
    disabledReason: z.string().optional(),
    appliesTo: z.object({
      classifications: z.array(z.string().min(1)).min(1),
      employmentTypes: z.array(EmploymentTypeSchema).min(1),
    }),
    when: z.discriminatedUnion("kind", [WeeklyWindowCondition, PublicHolidayCondition, OvertimeCondition]),
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
    if (rule.status === "ENABLED" && rule.verification.status !== "TRANSCRIBED_FROM_SOURCE") {
      ctx.addIssue({
        code: "custom",
        message: "Only source-verified rules may be enabled",
        path: ["status"],
      });
    }
    if (rule.status === "ENABLED" && rule.when.kind === "OVERTIME") {
      ctx.addIssue({
        code: "custom",
        message: "Overtime rules are reference-only in this engine version",
        path: ["status"],
      });
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
  sources: z.array(SourceReferenceSchema).min(1),
});

/** A numeric limit taken from the award, with the clause it comes from. */
const ConstraintSchema = z.object({
  minutes: z.number().int().positive(),
  description: z.string().min(1),
  sources: z.array(SourceReferenceSchema).min(1),
});

export const AwardRuleSetSchema = z.object({
  schemaVersion: z.literal(1),
  awardCode: z.string().regex(/^MA\d{6}$/),
  awardTitle: z.string().min(1),
  /** Immutable identifier. A correction produces a new revision (r2), never an edit of r1. */
  version: z.string().regex(/^MA\d{6}\/\d{4}-\d{2}-\d{2}\/r\d+$/),
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
  }),
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
export type WeeklyWindowRule = RateRule & { when: z.infer<typeof WeeklyWindowCondition> };
