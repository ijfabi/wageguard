import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateEmploymentRequest,
  EmploymentResponse,
  UpdateEmploymentRequest,
} from "@wageguard/api-contracts";
import { DEFAULT_ALLOWANCES, DEFAULT_WORK_CONDITIONS } from "@wageguard/api-contracts";
import type { PayPeriodCalculationInput } from "@wageguard/calculation-engine";
import { LocalDate, TimeZone } from "@wageguard/domain";

import { ApiError } from "../../common/api-error.js";
import { decodeCursor, toPage } from "../../common/pagination.js";
import { Prisma, type Employment } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { fromDateColumn, localDateColumn } from "../shifts/shift-times.js";

@Injectable()
export class EmploymentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateEmploymentRequest): Promise<EmploymentResponse> {
    const employment = await this.prisma.employment.create({ data: { userId, ...toColumns(request) } });
    return toEmploymentResponse(employment);
  }

  /** Replaces the editable terms. Audits already run keep the terms they were calculated with. */
  async update(userId: string, id: string, request: UpdateEmploymentRequest): Promise<EmploymentResponse> {
    await this.findOwned(userId, id);
    const employment = await this.prisma.employment.update({
      where: { id },
      data: {
        ...toColumns(request),
        ...(request.partTimeGuaranteedMinutes === undefined
          ? { partTimeGuaranteedMinutes: Prisma.DbNull }
          : {}),
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

function toColumns(request: CreateEmploymentRequest) {
  TimeZone.of(request.timeZone, "timeZone"); // DomainError -> 422 when not a valid IANA zone
  for (const [path, value] of [
    ["dateOfBirth", request.dateOfBirth],
    ["employmentStartDate", request.employmentStartDate],
  ] as const) {
    if (value !== undefined) {
      LocalDate.parse(value, path); // rejects impossible dates such as 2026-02-30
    }
  }
  const conditions = request.conditions ?? DEFAULT_WORK_CONDITIONS;
  const allowances = request.allowances ?? DEFAULT_ALLOWANCES;
  return {
    label: request.label,
    awardCode: request.awardCode,
    classificationCode: request.classificationCode,
    employmentType: request.employmentType,
    state: request.state,
    timeZone: request.timeZone,
    awardCoverage: request.declarations.awardCoverage,
    enterpriseAgreement: request.declarations.enterpriseAgreement,
    ageBand: request.declarations.ageBand,
    shiftworker: request.declarations.shiftworker,
    ...(request.partTimeGuaranteedMinutes === undefined
      ? {}
      : { partTimeGuaranteedMinutes: request.partTimeGuaranteedMinutes }),
    dateOfBirth: request.dateOfBirth === undefined ? null : localDateColumn(request.dateOfBirth),
    employmentStartDate:
      request.employmentStartDate === undefined ? null : localDateColumn(request.employmentStartDate),
    spanException: conditions.spanException,
    schoolStudent: conditions.schoolStudent,
    reducedBreakAgreed: conditions.reducedBreakAgreed,
    averagingRoster: conditions.averagingRoster,
    bakingProduction: conditions.bakingProduction,
    apprentice: conditions.apprentice,
    laundersSpecialClothing: allowances.laundersSpecialClothing,
    appointedFirstAider: allowances.appointedFirstAider,
    holdsLiquorLicence: allowances.holdsLiquorLicence,
    brokenHill: allowances.brokenHill,
  };
}

export function toEmploymentResponse(e: Employment): EmploymentResponse {
  return {
    id: e.id,
    label: e.label,
    awardCode: e.awardCode,
    classificationCode: e.classificationCode,
    employmentType: e.employmentType,
    state: e.state,
    timeZone: e.timeZone,
    declarations: {
      awardCoverage: e.awardCoverage,
      enterpriseAgreement: e.enterpriseAgreement,
      ageBand: e.ageBand,
      shiftworker: e.shiftworker,
    },
    partTimeGuaranteedMinutes:
      (e.partTimeGuaranteedMinutes as EmploymentResponse["partTimeGuaranteedMinutes"]) ?? null,
    dateOfBirth: e.dateOfBirth === null ? null : fromDateColumn(e.dateOfBirth),
    employmentStartDate: e.employmentStartDate === null ? null : fromDateColumn(e.employmentStartDate),
    conditions: {
      spanException: e.spanException,
      schoolStudent: e.schoolStudent,
      reducedBreakAgreed: e.reducedBreakAgreed,
      averagingRoster: e.averagingRoster,
      bakingProduction: e.bakingProduction,
      apprentice: e.apprentice,
    },
    allowances: {
      laundersSpecialClothing: e.laundersSpecialClothing,
      appointedFirstAider: e.appointedFirstAider,
      holdsLiquorLicence: e.holdsLiquorLicence,
      brokenHill: e.brokenHill,
    },
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** The employment as the calculation engine needs it. */
export function toEngineEmployment(e: Employment): PayPeriodCalculationInput["employment"] {
  return {
    employmentId: e.id,
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
    ...(e.partTimeGuaranteedMinutes === null
      ? {}
      : {
          partTimeGuaranteedMinutes:
            e.partTimeGuaranteedMinutes as PayPeriodCalculationInput["employment"]["partTimeGuaranteedMinutes"],
        }),
    ...(e.dateOfBirth === null ? {} : { dateOfBirth: fromDateColumn(e.dateOfBirth) }),
    ...(e.employmentStartDate === null ? {} : { employmentStartDate: fromDateColumn(e.employmentStartDate) }),
    spanException: e.spanException,
    schoolStudent: e.schoolStudent,
    reducedBreakAgreed: e.reducedBreakAgreed,
    averagingRoster: e.averagingRoster,
    bakingProduction: e.bakingProduction,
    apprentice: e.apprentice,
    allowances: {
      laundersSpecialClothing: e.laundersSpecialClothing,
      appointedFirstAider: e.appointedFirstAider,
      holdsLiquorLicence: e.holdsLiquorLicence,
      brokenHill: e.brokenHill,
    },
  };
}
