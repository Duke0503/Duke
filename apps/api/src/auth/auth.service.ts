/**
 * Checking the password, and handing back a cookie value.
 *
 * The shape of the whole thing is deliberately small: compare two values from `.env`, and if
 * they match, sign a token with an expiry. There is no user table, no registration, no password
 * reset — Duke is one person's friend, and this is the door to it.
 *
 * `AUTH_PASSWORD_HASH` does double duty: it is what the password is checked against, and it is
 * the key the session is signed with. That is not a trick to save a variable — it means
 * changing the password ends every other session, which is what someone changing a password is
 * asking for.
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  SESSION_HOURS_DEFAULT,
  constantTimeEquals,
  envNumber,
  optionalEnv,
  requireEnv,
  signSession,
  verifyPassword,
} from "@duke/shared";
import type { LoginBody } from "./auth.dto";

export interface LoginView {
  /**
   * The cookie's value. It goes to the **web app**, never to the browser: the web app sets it
   * as an HttpOnly cookie, so no script in the page can read it.
   */
  readonly token: string;
  /** Unix milliseconds, so the caller can expire the cookie at the same moment. */
  readonly expiresAt: number;
  readonly username: string;
}

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  login(body: LoginBody): LoginView {
    const username = requireEnv("AUTH_USERNAME");
    const secret = requireEnv("AUTH_PASSWORD_HASH");

    // Both are always checked, and neither with `&&`: a guess that is right about the username
    // and wrong about the password should take the same time as the other way round.
    const userOk = constantTimeEquals(body.username, username);
    const passwordOk = verifyPassword(body.password, secret);

    if (!(userOk && passwordOk)) {
      // One sentence for both halves. Which one was wrong is exactly what a guesser wants to
      // learn, and the log does not need it either — a failed sign-in is enough.
      throw new UnauthorizedException({
        code: "BAD_CREDENTIALS",
        message: "That username or password is not right.",
        problems: [{ field: "password", problem: "That username or password is not right." }],
      });
    }

    const hours = envNumber("AUTH_SESSION_HOURS", SESSION_HOURS_DEFAULT);
    const expiresAt = Date.now() + hours * HOUR_MS;

    return {
      token: signSession(secret, { username, expiresAt }),
      expiresAt,
      username: optionalEnv("AUTH_USERNAME", username),
    };
  }
}
