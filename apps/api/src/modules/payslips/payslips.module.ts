import { Module } from "@nestjs/common";

import { EmploymentsModule } from "../employments/employments.module.js";
import { PayslipsController } from "./payslips.controller.js";
import { PayslipsService } from "./payslips.service.js";

@Module({
  imports: [EmploymentsModule],
  controllers: [PayslipsController],
  providers: [PayslipsService],
  exports: [PayslipsService],
})
export class PayslipsModule {}
