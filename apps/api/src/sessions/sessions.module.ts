import { Module } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, DeviceUserGuard],
})
export class SessionsModule {}
