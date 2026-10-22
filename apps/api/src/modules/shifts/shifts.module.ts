import { Module } from "@nestjs/common";

import { EmploymentsModule } from "../employments/employments.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { ShiftsController } from "./shifts.controller.js";
import { ShiftsService } from "./shifts.service.js";

@Module({
  imports: [EmploymentsModule, IdentityModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
