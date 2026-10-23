import { Inject, Injectable } from "@nestjs/common";
import {
  ApiErrorCode,
  type CreateShiftRequest,
  type ImportShiftsResponse,
  type ListShiftsQuery,
  type ShiftResponse,
  type UpdateShiftRequest,
} from "@wageguard/api-contracts";
import { DomainValidationError, type ResolvedShift } from "@wageguard/domain";

import { ApiError, type ApiIssue } from "../../common/api-error.js";
import { decodeCursor, toPage } from "../../common/pagination.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { telemetry } from "../../infrastructure/telemetry.js";
import { EmploymentsService } from "../employments/employments.service.js";
import { AuditEventsService } from "../identity/audit-events.service.js";
import { parseShiftCsv } from "./csv-import.js";
import {
  breakColumns,
  localDateColumn,
  resolveTimes,
  shiftColumns,
  toShiftResponse,
  type ShiftTimes,
} from "./shift-times.js";

const withBreaks = { breaks: { orderBy: { position: "asc" } } } as const;

@Injectable()
export class ShiftsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmploymentsService) private readonly employments: EmploymentsService,
    @Inject(AuditEventsService) private readonly events: AuditEventsService,
  ) {}

  async create(userId: string, request: CreateShiftRequest): Promise<ShiftResponse> {
    const employment = await this.employments.findOwned(userId, request.employmentId);
    const resolved = resolveTimes(request, employment.timeZone);
    const shift = await this.prisma.shift.create({
      data: {
        userId,
        employmentId: employment.id,
        ...shiftColumns(request, resolved),
        breaks: { create: breakColumns(request) },
      },
      include: withBreaks,
    });
    return toShiftResponse(shift);
  }

  async list(userId: string, query: ListShiftsQuery) {
    const cursor = decodeCursor(query.cursor);
    const ascending = query.sort === "start_asc";
    const after = (at: Date, id: string): Prisma.ShiftWhereInput => ({
      OR: [
        { startAt: ascending ? { gt: at } : { lt: at } },
        { startAt: at, id: ascending ? { gt: id } : { lt: id } },
      ],
    });
    const where: Prisma.ShiftWhereInput = {
      userId,
      ...(query.employmentId === undefined ? {} : { employmentId: query.employmentId }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            startDate: {
              ...(query.from === undefined ? {} : { gte: localDateColumn(query.from) }),
              ...(query.to === undefined ? {} : { lte: localDateColumn(query.to) }),
            },
          }),
      ...(cursor === null ? {} : after(new Date(cursor.k), cursor.id)),
    };
    const direction = ascending ? "asc" : "desc";
    const rows = await this.prisma.shift.findMany({
      where,
      orderBy: [{ startAt: direction }, { id: direction }],
      take: query.limit + 1,
      include: withBreaks,
    });
    return toPage(rows, query.limit, (r) => ({ k: r.startAt.toISOString(), id: r.id }), toShiftResponse);
  }

  async get(userId: string, id: string): Promise<ShiftResponse> {
    const shift = await this.prisma.shift.findFirst({ where: { id, userId }, include: withBreaks });
    if (shift === null) {
      throw ApiError.notFound("Shift");
    }
    return toShiftResponse(shift);
  }

  /**
   * Replaces a shift's times and breaks under optimistic concurrency: the update applies only if
   * the client's `version` is current, otherwise 409 VERSION_CONFLICT. The shift's employment and
   * owner never change (also enforced by a database trigger).
   */
  async update(userId: string, id: string, request: UpdateShiftRequest): Promise<ShiftResponse> {
    const existing = await this.prisma.shift.findFirst({
      where: { id, userId },
      include: { employment: true },
    });
    if (existing === null) {
      throw ApiError.notFound("Shift");
    }
    const resolved = resolveTimes(request, existing.employment.timeZone);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shift.updateMany({
        where: { id, userId, version: request.version },
        data: { ...shiftColumns(request, resolved), version: { increment: 1 } },
      });
      if (count === 0) {
        throw new ApiError(
          409,
          ApiErrorCode.VERSION_CONFLICT,
          "The shift was changed by another request; reload and retry",
        );
      }
      await tx.shiftBreak.deleteMany({ where: { shiftId: id } });
      await tx.shiftBreak.createMany({ data: breakColumns(request).map((b) => ({ ...b, shiftId: id })) });
      return toShiftResponse(await tx.shift.findUniqueOrThrow({ where: { id }, include: withBreaks }));
    });
  }

  /**
   * All-or-nothing CSV import: every row is validated (format, domain rules, overlaps within the
   * file) before anything is written; then all shifts are inserted in one transaction, where the
   * database also rejects overlaps with existing shifts.
   */
  async importCsv(userId: string, employmentId: string, csv: string): Promise<ImportShiftsResponse> {
    try {
      const result = await this.importValidated(userId, employmentId, csv);
      telemetry.shiftImport("imported");
      return result;
    } catch (error: unknown) {
      telemetry.shiftImport("rejected");
      throw error;
    }
  }

  private async importValidated(
    userId: string,
    employmentId: string,
    csv: string,
  ): Promise<ImportShiftsResponse> {
    const employment = await this.employments.findOwned(userId, employmentId);
    const parsed = parseShiftCsv(csv);
    if (!parsed.ok) {
      throw ApiError.validation(parsed.issues, "The CSV could not be imported");
    }

    const issues: ApiIssue[] = [];
    const resolved: { times: ShiftTimes; shift: ResolvedShift; line: number }[] = [];
    parsed.rows.forEach((times, index) => {
      try {
        resolved.push({
          times,
          shift: resolveTimes(times, employment.timeZone, `line ${index + 2}`),
          line: index + 2,
        });
      } catch (error: unknown) {
        if (error instanceof DomainValidationError) {
          issues.push(...error.issues);
          return;
        }
        throw error;
      }
    });
    const sorted = [...resolved].sort((a, b) => a.shift.interval.start.compare(b.shift.interval.start));
    for (const [i, current] of sorted.entries()) {
      const previous = sorted[i - 1];
      if (previous?.shift.interval.overlaps(current.shift.interval) === true) {
        issues.push({
          code: "OVERLAPPING_SHIFTS",
          message: `Overlaps the shift on line ${previous.line}`,
          path: `line ${current.line}`,
        });
      }
    }
    if (issues.length > 0) {
      throw ApiError.validation(issues, "The CSV could not be imported");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const shifts = [];
      for (const { times, shift } of resolved) {
        shifts.push(
          await tx.shift.create({
            data: {
              userId,
              employmentId: employment.id,
              ...shiftColumns(times, shift),
              breaks: { create: breakColumns(times) },
            },
            include: withBreaks,
          }),
        );
      }
      await this.events.record("SHIFTS_IMPORTED", userId, { count: shifts.length }, tx);
      return shifts;
    });
    return { imported: created.length, shifts: created.map(toShiftResponse) };
  }
}
