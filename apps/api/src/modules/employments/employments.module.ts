import { Module } from "@nestjs/common";

import { EmploymentsController } from "./employments.controller.js";
import { EmploymentsService } from "./employments.service.js";

@Module({
  controllers: [EmploymentsController],
  providers: [EmploymentsService],
  exports: [EmploymentsService],
})
export class EmploymentsModule {}
