import { Module } from "@nestjs/common";

import { AuditEventsService } from "./audit-events.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { EmailTokensService } from "./email-tokens.service.js";
import { SessionService } from "./session.service.js";
import { TwoFactorService } from "./two-factor.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    AuditEventsService,
    AuthGuard,
    EmailTokensService,
    TwoFactorService,
  ],
  exports: [SessionService, AuditEventsService, AuthGuard],
})
export class IdentityModule {}
