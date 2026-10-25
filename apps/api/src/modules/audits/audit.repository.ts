import { Inject, Injectable } from "@nestjs/common";
import type { ListAuditsQuery } from "@wageguard/api-contracts";

import type { Cursor } from "../../common/pagination.js";
import { Prisma, type Audit } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

/**
 * Column sets per read. The JSON snapshots (input, payslip, result, reconciliation) are most of an
 * audit row's size, so each read loads only what its response needs (measured in Benchmark C:
 * loading every snapshot made a 20-row history page about 30x slower than the query itself).
 */
export const AUDIT_SUMMARY_COLUMNS = {
  id: true,
  employmentId: true,
  payslipId: true,
  status: true,
  periodStart: true,
  periodEnd: true,
  findingStatus: true,
  calculationStatus: true,
  expectedAmount: true,
  reportedAmount: true,
  difference: true,
  shiftCount: true,
  ruleSetVersion: true,
  engineVersion: true,
  createdAt: true,
} as const satisfies Prisma.AuditSelect;

/** Detail adds provenance and the two snapshots it reads (reconciliation; result for assumptions). */
const AUDIT_DETAIL_COLUMNS = {
  ...AUDIT_SUMMARY_COLUMNS,
  requestHash: true,
  ruleSetFingerprint: true,
  inputHash: true,
  calculatedAt: true,
  reconciliation: true,
  result: true,
} as const satisfies Prisma.AuditSelect;

const AUDIT_RESULT_COLUMNS = { id: true, result: true } as const satisfies Prisma.AuditSelect;

export type AuditSummaryRow = Prisma.AuditGetPayload<{ select: typeof AUDIT_SUMMARY_COLUMNS }>;
export type AuditDetailRow = Prisma.AuditGetPayload<{ select: typeof AUDIT_DETAIL_COLUMNS }>;
export type AuditResultRow = Prisma.AuditGetPayload<{ select: typeof AUDIT_RESULT_COLUMNS }>;
export type NewAudit = Omit<Prisma.AuditUncheckedCreateInput, "findings" | "id" | "createdAt"> & {
  findings: Omit<Prisma.AuditFindingUncheckedCreateInput, "auditId" | "id">[];
};

/** Thrown when an insert loses the race for a (user, idempotency key) pair. */
export class IdempotencyKeyTaken extends Error {
  constructor() {
    super("Idempotency key already used");
    this.name = "IdempotencyKeyTaken";
  }
}

/** How long an Idempotency-Key keeps returning the audit it produced. After that it can be reused. */
export const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** Port: persistence for immutable audit snapshots. */
export interface AuditRepository {
  /** The audit an unexpired key produced, if any. */
  findByIdempotencyKey(userId: string, key: string, now: Date): Promise<AuditDetailRow | null>;
  /**
   * Inserts the audit, its findings and its idempotency key atomically (an expired key is released
   * first). Throws IdempotencyKeyTaken when a live key already exists.
   */
  insert(audit: NewAudit, now: Date): Promise<AuditDetailRow>;
  findDetail(userId: string, id: string): Promise<AuditDetailRow | null>;
  findResult(userId: string, id: string): Promise<AuditResultRow | null>;
  /** The complete snapshot, for evidence reports. */
  findComplete(userId: string, id: string): Promise<Audit | null>;
  list(userId: string, query: ListAuditsQuery, cursor: Cursor | null): Promise<AuditSummaryRow[]>;
}

export const AUDIT_REPOSITORY = Symbol("AUDIT_REPOSITORY");

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(userId: string, key: string, now: Date): Promise<AuditDetailRow | null> {
    const entry = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
      select: { expiresAt: true, audit: { select: AUDIT_DETAIL_COLUMNS } },
    });
    return entry === null || entry.expiresAt <= now ? null : entry.audit;
  }

  async insert(audit: NewAudit, now: Date): Promise<AuditDetailRow> {
    const { findings, ...row } = audit;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.deleteMany({
          where: { userId: row.userId, key: row.idempotencyKey, expiresAt: { lte: now } },
        });
        // A nested create is a single atomic write: the audit never exists without its findings.
        const created = await tx.audit.create({
          data: { ...row, findings: { create: findings } },
          select: AUDIT_DETAIL_COLUMNS,
        });
        // The primary key (user, key) makes a concurrent duplicate fail here and roll everything back.
        await tx.idempotencyKey.create({
          data: {
            userId: row.userId,
            key: row.idempotencyKey,
            requestHash: row.requestHash,
            auditId: created.id,
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_KEY_TTL_MS),
          },
        });
        return created;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new IdempotencyKeyTaken();
      }
      throw error;
    }
  }

  findDetail(userId: string, id: string): Promise<AuditDetailRow | null> {
    return this.prisma.audit.findFirst({ where: { id, userId }, select: AUDIT_DETAIL_COLUMNS });
  }

  findResult(userId: string, id: string): Promise<AuditResultRow | null> {
    return this.prisma.audit.findFirst({ where: { id, userId }, select: AUDIT_RESULT_COLUMNS });
  }

  findComplete(userId: string, id: string): Promise<Audit | null> {
    return this.prisma.audit.findFirst({ where: { id, userId } });
  }

  list(userId: string, query: ListAuditsQuery, cursor: Cursor | null): Promise<AuditSummaryRow[]> {
    const descending = query.sort === "created_desc";
    const direction = descending ? "desc" : "asc";
    const at = cursor === null ? null : new Date(cursor.k);
    return this.prisma.audit.findMany({
      where: {
        userId,
        ...(query.findingStatus === undefined ? {} : { findingStatus: query.findingStatus }),
        ...(cursor === null || at === null
          ? {}
          : {
              OR: [
                { createdAt: descending ? { lt: at } : { gt: at } },
                { createdAt: at, id: descending ? { lt: cursor.id } : { gt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: query.limit + 1,
      select: AUDIT_SUMMARY_COLUMNS,
    });
  }
}
