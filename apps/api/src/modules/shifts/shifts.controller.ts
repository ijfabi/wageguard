import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import {
  ApiErrorCode,
  CreateShiftRequestSchema,
  IdSchema,
  ImportShiftsQuerySchema,
  ListShiftsQuerySchema,
  UpdateShiftRequestSchema,
  type CreateShiftRequest,
  type ImportShiftsResponse,
  type ListShiftsQuery,
  type ShiftResponse,
  type UpdateShiftRequest,
} from "@wageguard/api-contracts";
import type { z } from "zod";

import { ApiError } from "../../common/api-error.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/auth-context.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { ShiftsService } from "./shifts.service.js";

@Controller("shifts")
export class ShiftsController {
  constructor(@Inject(ShiftsService) private readonly shifts: ShiftsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(CreateShiftRequestSchema)) body: CreateShiftRequest,
  ): Promise<ShiftResponse> {
    return this.shifts.create(user.id, body);
  }

  /** Body is the raw CSV with `Content-Type: text/csv` (size-limited by the body parser). */
  @Post("import")
  import(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodPipe(ImportShiftsQuerySchema)) query: z.output<typeof ImportShiftsQuerySchema>,
    @Body() body: unknown,
  ): Promise<ImportShiftsResponse> {
    if (typeof body !== "string") {
      throw new ApiError(
        415,
        ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
        "Send the CSV file with Content-Type: text/csv",
      );
    }
    return this.shifts.importCsv(user.id, query.employmentId, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodPipe(ListShiftsQuerySchema)) query: ListShiftsQuery,
  ) {
    return this.shifts.list(user.id, query);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
  ): Promise<ShiftResponse> {
    return this.shifts.get(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
    @Body(new ZodPipe(UpdateShiftRequestSchema)) body: UpdateShiftRequest,
  ): Promise<ShiftResponse> {
    return this.shifts.update(user.id, id, body);
  }
}
