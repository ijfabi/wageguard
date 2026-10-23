import { Global, Module, type DynamicModule, type Provider } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { ErrorFilter } from "./common/error.filter.js";
import { OriginGuard } from "./common/origin.guard.js";
import { throttlerOptions } from "./common/rate-limit.js";
import { APP_CONFIG, type AppConfig } from "./config/config.js";
import { CLOCK, systemClock, type Clock } from "./infrastructure/clock.js";
import { loggerOptions } from "./infrastructure/logging.js";
import { PrismaService } from "./infrastructure/prisma.service.js";
import { AuditsModule } from "./modules/audits/audits.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { EmploymentsModule } from "./modules/employments/employments.module.js";
import { HealthController } from "./modules/health/health.controller.js";
import { AuthGuard } from "./modules/identity/auth.guard.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { argon2Hasher, PASSWORD_HASHER, type PasswordHasher } from "./modules/identity/password-hasher.js";
import { PayslipsModule } from "./modules/payslips/payslips.module.js";
import { RulesController } from "./modules/rules/rules.controller.js";
import { ShiftsModule } from "./modules/shifts/shifts.module.js";
import { OpenApiController } from "./openapi/openapi.controller.js";

export interface AppOverrides {
  readonly clock?: Clock;
  readonly passwordHasher?: PasswordHasher;
}

/** Process-wide infrastructure, available to every module. */
@Global()
@Module({})
class InfrastructureModule {
  static forRoot(config: AppConfig, overrides: AppOverrides): DynamicModule {
    const providers: Provider[] = [
      { provide: APP_CONFIG, useValue: config },
      { provide: CLOCK, useValue: overrides.clock ?? systemClock },
      { provide: PASSWORD_HASHER, useValue: overrides.passwordHasher ?? argon2Hasher },
      PrismaService,
    ];
    return { module: InfrastructureModule, providers, exports: providers };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, overrides: AppOverrides = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        InfrastructureModule.forRoot(config, overrides),
        LoggerModule.forRoot(loggerOptions(config)),
        ThrottlerModule.forRoot(throttlerOptions(config)),
        IdentityModule,
        EmploymentsModule,
        ShiftsModule,
        PayslipsModule,
        AuditsModule,
        DashboardModule,
      ],
      controllers: [RulesController, HealthController, OpenApiController],
      providers: [
        // Guards run in this order: rate limit, then CSRF origin check, then authentication.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useExisting: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }
}
