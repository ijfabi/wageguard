import { z } from "zod";

import { AuditSummarySchema, FindingStatusSchema } from "./audits.js";

export const DASHBOARD_HISTORY_MONTHS = 12;

const statusCounts = z.strictObject(
  Object.fromEntries(FindingStatusSchema.options.map((s) => [s, z.number().int()])) as Record<
    z.infer<typeof FindingStatusSchema>,
    z.ZodNumber
  >,
);

/** Aggregates computed by the database for the signed-in user's audits only. */
export const DashboardResponseSchema = z.strictObject({
  totals: z.strictObject({
    audits: z.number().int(),
    shiftsAnalysed: z.number().int(),
    byFindingStatus: statusCounts,
    /** REVIEW_REQUIRED + INCOMPLETE_DATA + UNSUPPORTED_SCENARIO: audits without a definitive comparison. */
    needsAttention: z.number().int(),
    /** Sum of differences on POTENTIAL_UNDERPAYMENT audits (negative or zero), 2dp string. */
    potentialUnderpaymentAmount: z.string(),
  }),
  processing: z.strictObject({ completed: z.number().int() }),
  recentAudits: z.array(AuditSummarySchema),
  /** Audits created per UTC month for the last 12 months (oldest first, months with none included). */
  history: z.array(
    z.strictObject({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      total: z.number().int(),
      byFindingStatus: statusCounts,
    }),
  ),
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
