import { Inject, Injectable } from "@nestjs/common";
import {
  ApiErrorCode,
  type AuditDetail,
  type AuditLines,
  type AuditReport,
  type CreateAuditRequest,
  type ListAuditsQuery,
} from "@wageguard/api-contracts";
import {
  calculatePayPeriod,
  reconcile,
  type PayPeriodCalculationInput,
  type RuleSetResolver,
} from "@wageguard/calculation-engine";
import { contentHash } from "@wageguard/domain";

import { ApiError } from "../../common/api-error.js";
import { decodeCursor, toPage } from "../../common/pagination.js";
import { CLOCK, type Clock } from "../../infrastructure/clock.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { EmploymentsService } from "../employments/employments.service.js";
import { AuditEventsService } from "../identity/audit-events.service.js";
import { PayslipsService, toDomainPayslip, toPayslipResponse } from "../payslips/payslips.service.js";
import { localDateColumn } from "../shifts/shift-times.js";
import { toAuditDetail, toAuditLines, toAuditReport, toAuditSummary } from "./audit.mappers.js";
import {
  AUDIT_REPOSITORY,
  IdempotencyKeyTaken,
  type AuditRecord,
  type AuditRepository,
} from "./audit.repository.js";

export const RULE_SET_RESOLVER = Symbol("RULE_SET_RESOLVER");

export interface CreateAuditOutcome {
  readonly audit: AuditDetail;
  /** True when an earlier audit with the same idempotency key and request was returned. */
  readonly replayed: boolean;
}

@Injectable()
export class AuditsService {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly audits: AuditRepository,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmploymentsService) private readonly employments: EmploymentsService,
    @Inject(PayslipsService) private readonly payslips: PayslipsService,
    @Inject(AuditEventsService) private readonly events: AuditEventsService,
    @Inject(RULE_SET_RESOLVER) private readonly rules: RuleSetResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Idempotent audit creation. Guarantees (see docs/api.md):
   * - at most one audit is persisted per (user, Idempotency-Key), including under concurrency
   *   (enforced by a unique index; the losing request returns the winner's audit);
   * - a repeated key with the same request returns the stored audit unchanged (replayed = true);
   * - a repeated key with a different request is rejected with 422 IDEMPOTENCY_KEY_REUSED.
   */
  async create(
    userId: string,
    idempotencyKey: string,
    request: CreateAuditRequest,
  ): Promise<CreateAuditOutcome> {
    const requestHash = contentHash({
      employmentId: request.employmentId,
      payslipId: request.payslipId,
      declaredPublicHolidays: [...(request.declaredPublicHolidays ?? [])].sort(),
    });

    const existing = await this.audits.findByIdempotencyKey(userId, idempotencyKey);
    if (existing !== null) {
      return this.replay(existing, requestHash);
    }

    const employment = await this.employments.findOwned(userId, request.employmentId);
    const payslip = await this.payslips.findOwned(userId, request.payslipId);
    if (payslip.employmentId !== employment.id) {
      throw ApiError.validation([
        {
          code: "PAYSLIP_EMPLOYMENT_MISMATCH",
          message: "The payslip belongs to a different employment",
          path: "payslipId",
        },
      ]);
    }
    const domainPayslip = toDomainPayslip(payslip);
    const shifts = await this.prisma.shift.findMany({
      where: {
        userId,
        employmentId: employment.id,
        startDate: { gte: payslip.periodStart, lte: payslip.periodEnd },
      },
      include: { breaks: { orderBy: { position: "asc" } } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });

    const input: PayPeriodCalculationInput = {
      employment: {
        employmentId: employment.id,
        awardCode: employment.awardCode,
        classificationCode: employment.classificationCode,
        employmentType: employment.employmentType,
        timeZone: employment.timeZone,
        declarations: {
          awardCoverage: employment.awardCoverage,
          enterpriseAgreement: employment.enterpriseAgreement,
          ageBand: employment.ageBand,
          shiftworker: employment.shiftworker,
        },
        ...(employment.partTimeGuaranteedMinutes === null
          ? {}
          : {
              partTimeGuaranteedMinutes:
                employment.partTimeGuaranteedMinutes as PayPeriodCalculationInput["employment"]["partTimeGuaranteedMinutes"],
            }),
      },
      payPeriod: {
        startDate: domainPayslip.payPeriod.startDate.toString(),
        endDate: domainPayslip.payPeriod.endDate.toString(),
      },
      shifts: shifts.map((s) => ({
        id: s.id,
        start: s.startLocal,
        end: s.endLocal,
        ...(s.startUtcOffsetMinutes === null ? {} : { startUtcOffsetMinutes: s.startUtcOffsetMinutes }),
        ...(s.endUtcOffsetMinutes === null ? {} : { endUtcOffsetMinutes: s.endUtcOffsetMinutes }),
        breaks: s.breaks.map((b) => ({
          kind: b.kind,
          start: b.startLocal,
          end: b.endLocal,
          ...(b.startUtcOffsetMinutes === null ? {} : { startUtcOffsetMinutes: b.startUtcOffsetMinutes }),
          ...(b.endUtcOffsetMinutes === null ? {} : { endUtcOffsetMinutes: b.endUtcOffsetMinutes }),
        })),
      })),
      ...(request.declaredPublicHolidays === undefined
        ? {}
        : { declaredPublicHolidays: request.declaredPublicHolidays }),
    };

    const calculatedAt = this.clock.now();
    const calculation = calculatePayPeriod(input, { rules: this.rules, calculatedAt });
    const reconciliation = reconcile(calculation, domainPayslip);

    try {
      const audit = await this.audits.insert({
        userId,
        employmentId: employment.id,
        payslipId: payslip.id,
        idempotencyKey,
        requestHash,
        status: "COMPLETED",
        periodStart: localDateColumn(calculation.payPeriod.startDate),
        periodEnd: localDateColumn(calculation.payPeriod.endDate),
        findingStatus: reconciliation.status,
        calculationStatus: calculation.status,
        expectedAmount: reconciliation.expectedAmount,
        reportedAmount: reconciliation.reportedAmount,
        difference: reconciliation.difference,
        shiftCount: shifts.length,
        ruleSetVersion: calculation.metadata.ruleSetVersion,
        ruleSetFingerprint: calculation.metadata.ruleSetFingerprint,
        engineVersion: calculation.metadata.engineVersion,
        inputHash: calculation.metadata.inputHash,
        inputSnapshot: toJson(input),
        payslipSnapshot: toJson(toPayslipResponse(payslip)),
        result: toJson(calculation),
        reconciliation: toJson(reconciliation),
        calculatedAt: new Date(calculatedAt.epochMs),
        findings: reconciliation.findings.map((f, position) => ({
          position,
          code: f.title.slice(0, 100),
          scope: f.scope,
          status: f.status,
          explanation: f.explanation,
          expectedAmount: f.expectedAmount,
          reportedAmount: f.reportedAmount,
          difference: f.difference,
          shiftIds: [...f.shiftIds],
          clauseRefs: [...f.clauseRefs],
          evidenceRefs: [...f.evidenceRefs],
          nextStep: f.nextStep,
        })),
      });
      await this.events.record("AUDIT_CREATED", userId, {
        auditId: audit.id,
        findingStatus: audit.findingStatus,
      });
      return { audit: toAuditDetail(audit), replayed: false };
    } catch (error: unknown) {
      if (error instanceof IdempotencyKeyTaken) {
        // A concurrent request with the same key committed first: return its audit.
        const winner = await this.audits.findByIdempotencyKey(userId, idempotencyKey);
        if (winner !== null) {
          return this.replay(winner, requestHash);
        }
      }
      throw error;
    }
  }

  async list(userId: string, query: ListAuditsQuery) {
    const rows = await this.audits.list(userId, query, decodeCursor(query.cursor));
    return toPage(rows, query.limit, (r) => ({ k: r.createdAt.toISOString(), id: r.id }), toAuditSummary);
  }

  async get(userId: string, id: string): Promise<AuditDetail> {
    return toAuditDetail(await this.findOwned(userId, id));
  }

  async lines(userId: string, id: string): Promise<AuditLines> {
    return toAuditLines(await this.findOwned(userId, id));
  }

  async report(userId: string, id: string): Promise<AuditReport> {
    const audit = await this.findOwned(userId, id);
    await this.events.record("REPORT_EXPORTED", userId, { auditId: audit.id });
    return toAuditReport(audit, this.clock.now().toString());
  }

  private async findOwned(userId: string, id: string): Promise<AuditRecord> {
    const audit = await this.audits.findOwned(userId, id);
    if (audit === null) {
      throw ApiError.notFound("Audit");
    }
    return audit;
  }

  private replay(existing: AuditRecord, requestHash: string): CreateAuditOutcome {
    if (existing.requestHash !== requestHash) {
      throw new ApiError(
        422,
        ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
        "This Idempotency-Key was already used for a different audit request",
      );
    }
    return { audit: toAuditDetail(existing), replayed: true };
  }
}

/** Round-trips through JSON so that only plain JSON is stored (no class instances). */
function toJson(value: unknown): object {
  return JSON.parse(JSON.stringify(value)) as object;
}
