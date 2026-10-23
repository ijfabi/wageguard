import { Controller, Get, Inject } from "@nestjs/common";
import type { DashboardResponse } from "@wageguard/api-contracts";

import { CurrentUser, type AuthenticatedUser } from "../../common/auth-context.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser): Promise<DashboardResponse> {
    return this.dashboard.summary(user.id);
  }
}
