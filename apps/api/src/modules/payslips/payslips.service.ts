import { Inject, Injectable } from "@nestjs/common";
import type { CreatePayslipRequest, PayslipResponse } from "@wageguard/api-contracts";
import { LocalDate, Money, PayPeriod, createPayslip, type Payslip as DomainPayslip } from "@wageguard/domain";

import { ApiError } from "../../common/api-error.js";
import type { Payslip, PayslipLine } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { EmploymentsService } from "../employments/employments.service.js";
import { fromDateColumn, localDateColumn } from "../shifts/shift-times.js";

export type PayslipRow = Payslip & { lines: PayslipLine[] };

@Injectable()
export class PayslipsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmploymentsService) private readonly employments: EmploymentsService,
  ) {}

  async create(userId: string, request: CreatePayslipRequest): Promise<PayslipResponse> {
    const employment = await this.employments.findOwned(userId, request.employmentId);
    // Domain validation: real dates, period of 1-31 days, lines summing exactly to gross.
    createPayslip({
      payPeriod: PayPeriod.of(
        LocalDate.parse(request.payPeriod.startDate, "payPeriod.startDate"),
        LocalDate.parse(request.payPeriod.endDate, "payPeriod.endDate"),
      ),
      grossPay: Money.of(request.grossPay),
      lines: request.lines.map((l) => ({
        category: l.category,
        description: l.description,
        amount: Money.of(l.amount),
      })),
    });
    const payslip = await this.prisma.payslip.create({
      data: {
        userId,
        employmentId: employment.id,
        periodStart: localDateColumn(request.payPeriod.startDate),
        periodEnd: localDateColumn(request.payPeriod.endDate),
        grossPay: Money.of(request.grossPay).toString(),
        lines: {
          create: request.lines.map((l, position) => ({
            position,
            category: l.category,
            description: l.description,
            amount: Money.of(l.amount).toString(),
          })),
        },
      },
      include: { lines: true },
    });
    return toPayslipResponse(payslip);
  }

  async get(userId: string, id: string): Promise<PayslipResponse> {
    return toPayslipResponse(await this.findOwned(userId, id));
  }

  async findOwned(userId: string, id: string): Promise<PayslipRow> {
    const payslip = await this.prisma.payslip.findFirst({ where: { id, userId }, include: { lines: true } });
    if (payslip === null) {
      throw ApiError.notFound("Payslip");
    }
    return payslip;
  }
}

/** Prisma Decimal -> exact 2dp string (never through a JavaScript number). */
export function decimalString(value: { toFixed(places: number): string }): string {
  return value.toFixed(2);
}

export function toDomainPayslip(row: PayslipRow): DomainPayslip {
  return createPayslip({
    payPeriod: PayPeriod.of(
      LocalDate.parse(fromDateColumn(row.periodStart)),
      LocalDate.parse(fromDateColumn(row.periodEnd)),
    ),
    grossPay: Money.of(decimalString(row.grossPay)),
    lines: sortedLines(row).map((l) => ({
      category: l.category,
      description: l.description,
      amount: Money.of(decimalString(l.amount)),
    })),
  });
}

export function toPayslipResponse(row: PayslipRow): PayslipResponse {
  return {
    id: row.id,
    employmentId: row.employmentId,
    payPeriod: { startDate: fromDateColumn(row.periodStart), endDate: fromDateColumn(row.periodEnd) },
    grossPay: decimalString(row.grossPay),
    lines: sortedLines(row).map((l) => ({
      category: l.category,
      description: l.description,
      amount: decimalString(l.amount),
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

function sortedLines(row: PayslipRow): PayslipLine[] {
  return [...row.lines].sort((a, b) => a.position - b.position);
}
