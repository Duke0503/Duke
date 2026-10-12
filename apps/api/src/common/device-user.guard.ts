/**
 * Who is calling?
 *
 * Reads `x-device-id`, turns it into a user row, and puts the id on the request. Applied to
 * the routes that store or read personal data — never to `/api/health` or `/api/ready`,
 * because those have to answer before anyone has an account.
 */

import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { UserRepository } from "@duke/core";
import { USER_REPOSITORY } from "../platform/tokens";
import { badRequest } from "./api-error";

export interface DeviceRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  userId?: string;
}

const HEADER = "x-device-id";

@Injectable()
export class DeviceUserGuard implements CanActivate {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const raw = request.headers[HEADER];
    const deviceId = (Array.isArray(raw) ? raw[0] : raw)?.trim();

    if (deviceId === undefined || deviceId.length === 0) {
      throw badRequest("DEVICE_ID_MISSING", [
        { field: HEADER, problem: `Send a stable anonymous id in the "${HEADER}" header.` },
      ]);
    }

    if (deviceId.length > 128) {
      throw badRequest("DEVICE_ID_TOO_LONG", [
        { field: HEADER, problem: "Keep the device id under 128 characters." },
      ]);
    }

    const user = await this.users.findOrCreateByDevice(deviceId);
    request.userId = user.id;
    return true;
  }
}
