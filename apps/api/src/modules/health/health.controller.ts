import { Controller, Get, Inject } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiErrorCode } from "@wageguard/api-contracts";

import { ApiError } from "../../common/api-error.js";
import { Public } from "../../common/auth-context.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";

@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get("health")
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Readiness: dependencies are reachable, so the instance can take traffic. */
  @Get("ready")
  async ready(): Promise<{ status: "ready" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiError(503, ApiErrorCode.NOT_READY, "Database is not reachable");
    }
    return { status: "ready" };
  }
}
