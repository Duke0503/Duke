/**
 * The lock on every route.
 *
 * Registered as a global guard in `AppModule`, so the default is **closed**. Two routes opt out
 * with `@Public()`: the health probe and the login itself.
 *
 * Why this exists at all, when the web app also knows about the cookie: the web app holds no
 * secret, so it cannot be trusted with the decision. It checks for the cookie only to send you
 * to the login screen instead of showing an empty shell. The decision that actually protects the
 * free tiers is made here, on the request that is about to touch something.
 *
 * The failure modes are told apart on purpose:
 *
 *   - **Nothing configured** is not a failed login. It is an unfinished setup, so it answers 503
 *     with the sentence `/api` already uses for a missing key — the one that says which key and
 *     how to make it.
 *   - **No cookie** is `SESSION_REQUIRED`; **a bad one** is `SESSION_INVALID`; **a stale one** is
 *     `SESSION_EXPIRED`. The three can be told apart in the log, which is how you find out
 *     whether a phone is being asked to sign in too often or somebody is guessing at cookies.
 */

import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DUKE_SESSION_COOKIE, readCookie, requireEnv, verifySession } from "@duke/shared";
import { IS_PUBLIC } from "./public.decorator";
import { unauthenticated } from "./api-error";

/** What the guard adds to the request, for anything downstream that wants to know. */
export interface SessionRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  session?: { readonly username: string };
}

const COOKIE_HEADER = "cookie";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (isPublic) return true;

    // Throws a 503 naming the key when the door has no lock yet. Deliberately before the cookie
    // is looked at: with nothing to verify against, every cookie is unverifiable.
    const secret = requireEnv("AUTH_PASSWORD_HASH");

    const request = context.switchToHttp().getRequest<SessionRequest>();
    const raw = request.headers[COOKIE_HEADER];
    const header = Array.isArray(raw) ? raw.join("; ") : raw;
    const token = readCookie(header, DUKE_SESSION_COOKIE);

    const check = verifySession(secret, token);
    if (!check.ok) {
      if (check.reason === "missing") {
        throw unauthenticated("SESSION_REQUIRED", "cookie", "Sign in to Duke first.");
      }
      if (check.reason === "expired") {
        throw unauthenticated("SESSION_EXPIRED", "cookie", "Your sign-in has ended. Sign in again.");
      }
      throw unauthenticated("SESSION_INVALID", "cookie", "That sign-in is not valid. Sign in again.");
    }

    request.session = { username: check.username };
    return true;
  }
}
