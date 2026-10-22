import { Inject, Injectable } from "@nestjs/common";
import type { CreateEmploymentRequest, EmploymentResponse } from "@wageguard/api-contracts";
import { TimeZone } from "@wageguard/domain";

import { ApiError } from "../../common/api-error.js";
import { decodeCursor, toPage } from "../../common/pagination.js";
import type { Employment } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

@Injectable()
export class EmploymentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateEmploymentRequest): Promise<EmploymentResponse> {
    TimeZone.of(request.timeZone, "timeZone"); // DomainError -> 422 when not a valid IANA zone
    const employment = await this.prisma.employment.create({
      data: {
        userId,
        label: request.label,
        awardCode: request.awardCode,
        classificationCode: request.classificationCode,
        employmentType: request.employmentType,
        timeZone: request.timeZone,
        awardCoverage: request.declarations.awardCoverage,
        enterpriseAgreement: request.declarations.enterpriseAgreement,
        ageBand: request.declarations.ageBand,
        shiftworker: request.declarations.shiftworker,
        ...(request.partTimeGuaranteedMinutes === undefined
          ? {}
          : { partTimeGuaranteedMinutes: request.partTimeGuaranteedMinutes }),
      },
    });
    return toEmploymentResponse(employment);
  }

  async list(userId: string, limit: number, cursorValue: string | undefined) {
    const cursor = decodeCursor(cursorValue);
    const rows = await this.prisma.employment.findMany({
      where: {
        userId,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(cursor.k) } },
                { createdAt: new Date(cursor.k), id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return toPage(rows, limit, (r) => ({ k: r.createdAt.toISOString(), id: r.id }), toEmploymentResponse);
  }

  async get(userId: string, id: string): Promise<EmploymentResponse> {
    return toEmploymentResponse(await this.findOwned(userId, id));
  }

  /** Loads an employment only if it belongs to the user; otherwise 404. */
  async findOwned(userId: string, id: string): Promise<Employment> {
    const employment = await this.prisma.employment.findFirst({ where: { id, userId } });
    if (employment === null) {
      throw ApiError.notFound("Employment");
    }
    return employment;
  }
}

export function toEmploymentResponse(e: Employment): EmploymentResponse {
  return {
    id: e.id,
    label: e.label,
    awardCode: e.awardCode,
    classificationCode: e.classificationCode,
    employmentType: e.employmentType,
    timeZone: e.timeZone,
    declarations: {
      awardCoverage: e.awardCoverage,
      enterpriseAgreement: e.enterpriseAgreement,
      ageBand: e.ageBand,
      shiftworker: e.shiftworker,
    },
    partTimeGuaranteedMinutes:
      (e.partTimeGuaranteedMinutes as EmploymentResponse["partTimeGuaranteedMinutes"]) ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}
