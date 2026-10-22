import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import {
  CreateEmploymentRequestSchema,
  IdSchema,
  PageQuerySchema,
  type CreateEmploymentRequest,
  type EmploymentResponse,
} from "@wageguard/api-contracts";
import type { z } from "zod";

import { CurrentUser, type AuthenticatedUser } from "../../common/auth-context.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { EmploymentsService } from "./employments.service.js";

@Controller("employments")
export class EmploymentsController {
  constructor(@Inject(EmploymentsService) private readonly employments: EmploymentsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(CreateEmploymentRequestSchema)) body: CreateEmploymentRequest,
  ): Promise<EmploymentResponse> {
    return this.employments.create(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodPipe(PageQuerySchema)) query: z.output<typeof PageQuerySchema>,
  ) {
    return this.employments.list(user.id, query.limit, query.cursor);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
  ): Promise<EmploymentResponse> {
    return this.employments.get(user.id, id);
  }
}
