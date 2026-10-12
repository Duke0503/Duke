import { Module } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { UsageModule } from "../usage/usage.module";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";

@Module({
  imports: [UsageModule],
  controllers: [CallsController],
  providers: [CallsService, DeviceUserGuard],
})
export class CallsModule {}
