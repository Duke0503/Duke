/**
 * The one door into Duke.
 *
 * `POST /api/auth/login` takes a username and a password and answers with a signed token. It is
 * the only route that is public by design — a session cannot be required to create one.
 *
 * Note what is *not* here: setting the cookie. The API never sees the browser — the web app
 * calls this, keeps the token, and sets the cookie itself, so the token stays out of the
 * browser's JavaScript entirely.
 */

import { Body, Controller, Post } from "@nestjs/common";
import { parseBody } from "../common/http";
import { Public } from "../common/public.decorator";
import { AuthService, type LoginView } from "./auth.service";
import { loginSchema } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: unknown): LoginView {
    return this.auth.login(parseBody(loginSchema, body));
  }
}
