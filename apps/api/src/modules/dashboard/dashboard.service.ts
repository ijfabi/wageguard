import { Inject, Injectable } from "@nestjs/common";
import {
  DASHBOARD_HISTORY_MONTHS,
  FindingStatusSchema,
  type DashboardResponse,
} from "@wageguard/api-contracts";

import type { FindingStatus } from "../../generated/prisma/client.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { toAuditSummary } from "../audits/audit.mappers.js";
import { decimalString } from "../payslips/payslips.service.js";

type StatusCounts = DashboardResponse["totals"]["byFindingStatus"];

const NEEDS_ATTENTION: readonly FindingStatus[] = [
  "REVIEW_REQUIRED",
  "INCOMPLETE_DATA",
  "UNSUPPORTED_SCENARIO",
];
const RECENT_AUDITS = 5;

const emptyCounts = (): StatusCounts =>
  Object.fromEntries(FindingStatusSchema.options.map((s) => [s, 0])) as StatusCounts;

/**
 * Dashboard aggregates, computed in PostgreSQL and always scoped to one user. The monthly history
 * query is a parameterised tagged template (no string interpolation of user input).
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(userId: string): Promise<DashboardResponse> {
    const months = this.historyMonths();
    const since = new Date(`${months[0] ?? "1970-01"}-01T00:00:00.000Z`);

    const [byStatus, shifts, underpaid, recent, monthly] = await Promise.all([
      this.prisma.audit.groupBy({ by: ["findingStatus"], where: { userId }, _count: { _all: true } }),
      this.prisma.audit.aggregate({ where: { userId }, _sum: { shiftCount: true }, _count: { _all: true } }),
      this.prisma.audit.aggregate({
        where: { userId, findingStatus: "POTENTIAL_UNDERPAYMENT" },
        _sum: { difference: true },
      }),
      this.prisma.audit.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RECENT_AUDITS,
      }),
      this.prisma.$queryRaw<{ month: string; finding_status: FindingStatus; count: bigint }[]>`
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
               finding_status,
               count(*) AS count
        FROM audits
        WHERE user_id = ${userId}::uuid AND created_at >= ${since}
        GROUP BY 1, 2`,
    ]);

    const totals = emptyCounts();
    for (const row of byStatus) {
      totals[row.findingStatus] = row._count._all;
    }
    const history = months.map((month) => ({ month, total: 0, byFindingStatus: emptyCounts() }));
    for (const row of monthly) {
      const bucket = history.find((h) => h.month === row.month);
      if (bucket !== undefined) {
        bucket.byFindingStatus[row.finding_status] = Number(row.count);
        bucket.total += Number(row.count);
      }
    }

    return {
      totals: {
        audits: shifts._count._all,
        shiftsAnalysed: shifts._sum.shiftCount ?? 0,
        byFindingStatus: totals,
        needsAttention: NEEDS_ATTENTION.reduce((sum, status) => sum + totals[status], 0),
        potentialUnderpaymentAmount:
          underpaid._sum.difference === null ? "0.00" : decimalString(underpaid._sum.difference),
      },
      // Audits are processed synchronously (ADR 0010), so every stored audit is complete.
      processing: { completed: shifts._count._all },
      recentAudits: recent.map(toAuditSummary),
      history,
    };
  }

  /** The last N UTC months ending with the current one, oldest first ("YYYY-MM"). */
  private historyMonths(): string[] {
    const now = new Date(this.clock.now().epochMs);
    return Array.from({ length: DASHBOARD_HISTORY_MONTHS }, (_, i) => {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (DASHBOARD_HISTORY_MONTHS - 1 - i), 1),
      );
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
  }
}
