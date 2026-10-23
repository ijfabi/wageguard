import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiErrorCode,
  CreateAuditRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  IdSchema,
  IdempotencyKeySchema,
  ListAuditsQuerySchema,
  type AuditDetail,
  type AuditLines,
  type AuditReport,
  type CreateAuditRequest,
  type ListAuditsQuery,
} from "@wageguard/api-contracts";
import type { Response } from "express";

import { ApiError } from "../../common/api-error.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/auth-context.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { AuditsService } from "./audits.service.js";

@Controller("audits")
export class AuditsController {
  constructor(@Inject(AuditsService) private readonly audits: AuditsService) {}

  /** 201 for a new audit; 200 with `Idempotent-Replayed: true` when the key was already used. */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers(IDEMPOTENCY_KEY_HEADER) key: string | undefined,
    @Body(new ZodPipe(CreateAuditRequestSchema)) body: CreateAuditRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuditDetail> {
    if (key === undefined) {
      throw new ApiError(
        400,
        ApiErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        "Send an Idempotency-Key header (for example a UUID)",
      );
    }
    const parsedKey = new ZodPipe(IdempotencyKeySchema).transform(key);
    const { audit, replayed } = await this.audits.create(user.id, parsedKey, body);
    res.status(replayed ? 200 : 201);
    if (replayed) {
      res.setHeader("Idempotent-Replayed", "true");
    }
    return audit;
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodPipe(ListAuditsQuerySchema)) query: ListAuditsQuery,
  ) {
    return this.audits.list(user.id, query);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
  ): Promise<AuditDetail> {
    return this.audits.get(user.id, id);
  }

  @Get(":id/lines")
  lines(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
  ): Promise<AuditLines> {
    return this.audits.lines(user.id, id);
  }

  /** Printable evidence report built from the same immutable snapshot as the JSON report. */
  @Get(":id/report/pdf")
  async reportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.audits.reportPdf(user.id, id);
    res.setHeader("Cache-Control", "no-store");
    return new StreamableFile(pdf, {
      type: "application/pdf",
      disposition: `attachment; filename="wageguard-audit-${id}.pdf"`,
      length: pdf.length,
    });
  }

  /** Full evidence report (JSON). */
  @Get(":id/report")
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuditReport> {
    const report = await this.audits.report(user.id, id);
    res.setHeader("Content-Disposition", `attachment; filename="wageguard-audit-${id}.json"`);
    return report;
  }
}
