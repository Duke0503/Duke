import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { UserId } from "../common/http";
import {
  SessionsService,
  type SessionDetailView,
  type SessionListItemView,
} from "./sessions.service";

@Controller("sessions")
@UseGuards(DeviceUserGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** History, newest first. `?limit=20` narrows it. */
  @Get()
  list(
    @UserId() userId: string,
    @Query("limit") limit?: string,
  ): Promise<SessionListItemView[]> {
    const parsed = limit === undefined ? undefined : Number(limit);
    return this.sessions.list(userId, parsed);
  }

  /** One call: transcript, corrections, new words. */
  @Get(":id")
  detail(@UserId() userId: string, @Param("id") id: string): Promise<SessionDetailView> {
    return this.sessions.detail(userId, id);
  }
}
