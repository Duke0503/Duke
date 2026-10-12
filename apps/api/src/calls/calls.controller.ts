import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { UserId } from "../common/http";
import { CallsService, type EndedCallView, type StartedCallView } from "./calls.service";

@Controller("calls")
@UseGuards(DeviceUserGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  /** Get a room and a token. Audio starts only after the phone joins. */
  @Post()
  start(@UserId() userId: string, @Body() body: unknown): Promise<StartedCallView> {
    return this.calls.start(userId, body);
  }

  /** Hang up. Kills the summariser budget, not the session. */
  @Post(":id/end")
  end(
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EndedCallView> {
    return this.calls.end(userId, id, body);
  }
}
