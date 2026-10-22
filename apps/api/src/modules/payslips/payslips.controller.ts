import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import {
  CreatePayslipRequestSchema,
  IdSchema,
  type CreatePayslipRequest,
  type PayslipResponse,
} from "@wageguard/api-contracts";

import { CurrentUser, type AuthenticatedUser } from "../../common/auth-context.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { PayslipsService } from "./payslips.service.js";

@Controller("payslips")
export class PayslipsController {
  constructor(@Inject(PayslipsService) private readonly payslips: PayslipsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(CreatePayslipRequestSchema)) body: CreatePayslipRequest,
  ): Promise<PayslipResponse> {
    return this.payslips.create(user.id, body);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
  ): Promise<PayslipResponse> {
    return this.payslips.get(user.id, id);
  }
}
