import { Module } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";

/**
 * Exported because `CallsModule` counts a call's length here when it ends.
 * One place adds to the meters, so the two call paths cannot disagree about the unit.
 */
@Module({
  controllers: [UsageController],
  providers: [UsageService, DeviceUserGuard],
  exports: [UsageService],
})
export class UsageModule {}
