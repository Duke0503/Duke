import { Controller, Get, UseGuards } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { UserId } from "../common/http";
import { UsageService, type UsageView } from "./usage.service";

@Controller("usage")
@UseGuards(DeviceUserGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  /** This month's counters for the Settings screen. */
  @Get()
  get(@UserId() userId: string): Promise<UsageView> {
    return this.usage.snapshot(userId);
  }
}
