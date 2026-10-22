import { Inject, Injectable } from "@nestjs/common";
import type { ListAuditsQuery } from "@wageguard/api-contracts";

import type { Cursor } from "../../common/pagination.js";
import { Prisma, type Audit, type AuditFinding } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

export type AuditRecord = Audit & { findings: AuditFinding[] };
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

/** Port: persistence for immutable audit snapshots. */
export interface AuditRepository {
  findByIdempotencyKey(userId: string, key: string): Promise<AuditRecord | null>;
  /** Inserts the audit and its findings atomically. Throws IdempotencyKeyTaken on a key collision. */
  insert(audit: NewAudit): Promise<AuditRecord>;
  findOwned(userId: string, id: string): Promise<AuditRecord | null>;
  list(userId: string, query: ListAuditsQuery, cursor: Cursor | null): Promise<Audit[]>;
}

export const AUDIT_REPOSITORY = Symbol("AUDIT_REPOSITORY");

const withFindings = { findings: { orderBy: { position: "asc" } } } as const;

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByIdempotencyKey(userId: string, key: string): Promise<AuditRecord | null> {
    return this.prisma.audit.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      include: withFindings,
    });
  }

  async insert(audit: NewAudit): Promise<AuditRecord> {
    const { findings, ...row } = audit;
    try {
      // A nested create is a single atomic write: the audit never exists without its findings.
      return await this.prisma.audit.create({
        data: { ...row, findings: { create: findings } },
        include: withFindings,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new IdempotencyKeyTaken();
      }
      throw error;
    }
  }

  findOwned(userId: string, id: string): Promise<AuditRecord | null> {
    return this.prisma.audit.findFirst({ where: { id, userId }, include: withFindings });
  }

  list(userId: string, query: ListAuditsQuery, cursor: Cursor | null): Promise<Audit[]> {
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
    });
  }
}
