import { Inject, Injectable } from "@nestjs/common";

import type { AuditEventType, Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

/**
 * Records security-relevant actions. Metadata must never contain passwords, tokens, email
 * addresses or payslip contents: only ids, counts and reason codes.
 */
@Injectable()
export class AuditEventsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(
    type: AuditEventType,
    userId: string | null,
    metadata: Record<string, string | number | boolean> = {},
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditEvent.create({ data: { type, userId, metadata } });
  }
}
