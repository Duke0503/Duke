/**
 * Signing in: one controller, one service, no persistence.
 *
 * There is no session table to clean up. A session is a signed cookie with an expiry in it, so
 * the API can verify one without knowing that it ever existed.
 */

import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
