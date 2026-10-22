import { Module } from "@nestjs/common";
import { bundledRegistry } from "@wageguard/award-rules";

import { EmploymentsModule } from "../employments/employments.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { PayslipsModule } from "../payslips/payslips.module.js";
import { AUDIT_REPOSITORY, PrismaAuditRepository } from "./audit.repository.js";
import { AuditsController } from "./audits.controller.js";
import { AuditsService, RULE_SET_RESOLVER } from "./audits.service.js";

@Module({
  imports: [EmploymentsModule, PayslipsModule, IdentityModule],
  controllers: [AuditsController],
  providers: [
    AuditsService,
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
    // The published, fingerprint-verified rule sets bundled with this build (ADR 0003).
    { provide: RULE_SET_RESOLVER, useFactory: bundledRegistry },
  ],
  exports: [RULE_SET_RESOLVER],
})
export class AuditsModule {}
