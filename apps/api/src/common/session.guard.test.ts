/**
 * The lock, tested where it actually decides.
 *
 * These are the shapes a browser can arrive in, plus the one that is not the visitor's fault:
 * a door with no lock yet. What matters most is the last test — the web app repeats the cookie
 * name, and a rename on one side with the other left alone would lock the owner out of his own
 * app in a way that looks like a bug in the browser.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionContext, HttpException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DUKE_SESSION_COOKIE, hashPassword, signSession } from "@duke/shared";
import { SessionGuard, type SessionRequest } from "./session.guard";

const SECRET = hashPassword("Admin@2026");

const reflectorFor = (isPublic: boolean): Reflector =>
  ({ getAllAndOverride: () => isPublic }) as unknown as Reflector;

const contextFor = (request: SessionRequest): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const requestWith = (cookie?: string): SessionRequest =>
  cookie === undefined
    ? { headers: {} }
    : { headers: { cookie } };

const token = (username: string, expiresAt: number): string => signSession(SECRET, { username, expiresAt });

/** Run the guard and describe how it refused, rather than only that it did. */
function refusal(run: () => unknown): { status: number; code: string; message: string } {
  try {
    run();
  } catch (error) {
    const http = error as Partial<HttpException>;
    if (typeof http.getResponse === "function") {
      const body = (http.getResponse() ?? {}) as { code?: string; message?: string };
      return { status: http.getStatus?.() ?? 0, code: body.code ?? "", message: body.message ?? "" };
    }

    // The unfinished-setup case throws `AppError`, which the exception filter turns into a 503
    // with the same message. Standing it in as 503 here is what that filter would do.
    const app = error as { code?: string; message?: string };
    return { status: 503, code: app.code ?? "", message: app.message ?? "" };
  }
  throw new Error("the guard let this through");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SessionGuard", () => {
  it("lets a public route through without a session and without a configured door", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", "");
    const guard = new SessionGuard(reflectorFor(true));
    expect(guard.canActivate(contextFor(requestWith()))).toBe(true);
  });

  it("answers 503 naming the key when no password has been set, instead of letting anyone in", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", "");
    const guard = new SessionGuard(reflectorFor(false));

    const answered = refusal(() => guard.canActivate(contextFor(requestWith())));
    expect(answered.status).toBe(503);
    expect(answered.message).toContain("AUTH_PASSWORD_HASH");
  });

  it("refuses a request with no cookie", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
    const guard = new SessionGuard(reflectorFor(false));

    expect(refusal(() => guard.canActivate(contextFor(requestWith())))).toMatchObject({
      status: 401,
      code: "SESSION_REQUIRED",
    });
  });

  it("accepts a good cookie and says who it is", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
    const guard = new SessionGuard(reflectorFor(false));
    const request = requestWith(`${DUKE_SESSION_COOKIE}=${token("admin", Date.now() + 60_000)}`);

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.session).toEqual({ username: "admin" });
  });

  it("finds its cookie when others are present", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
    const guard = new SessionGuard(reflectorFor(false));
    const cookie = `theme=dark; ${DUKE_SESSION_COOKIE}=${token("admin", Date.now() + 60_000)}; x=1`;

    expect(guard.canActivate(contextFor(requestWith(cookie)))).toBe(true);
  });

  it("refuses an expired cookie, and says that is what happened", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
    const guard = new SessionGuard(reflectorFor(false));
    const stale = token("admin", Date.now() - 1_000);

    expect(
      refusal(() => guard.canActivate(contextFor(requestWith(`${DUKE_SESSION_COOKIE}=${stale}`)))),
    ).toMatchObject({ status: 401, code: "SESSION_EXPIRED" });
  });

  it("refuses a cookie that was not signed by us", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
    const guard = new SessionGuard(reflectorFor(false));

    for (const bad of ["nonsense", "a.b", `${DUKE_SESSION_COOKIE}=a.b`, "..."]) {
      expect(
        refusal(() => guard.canActivate(contextFor(requestWith(`${DUKE_SESSION_COOKIE}=${bad}`)))),
      ).toMatchObject({ status: 401, code: "SESSION_INVALID" });
    }
  });

  it("refuses a cookie signed with a different password", () => {
    vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
    const guard = new SessionGuard(reflectorFor(false));
    const other = signSession(hashPassword("something else"), {
      username: "admin",
      expiresAt: Date.now() + 60_000,
    });

    expect(
      refusal(() => guard.canActivate(contextFor(requestWith(`${DUKE_SESSION_COOKIE}=${other}`)))),
    ).toMatchObject({ status: 401, code: "SESSION_INVALID" });
  });
});

describe("the cookie name, in both places that know it", () => {
  /** Walk up from wherever vitest was started until the monorepo root shows itself. */
  function webAuthFile(): string | null {
    let dir = process.cwd();
    for (let depth = 0; depth < 5; depth += 1) {
      const candidate = join(dir, "apps", "web", "src", "lib", "auth.ts");
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  it("is the same string in the API and in the web app", () => {
    const file = webAuthFile();
    expect(file, "could not find apps/web/src/lib/auth.ts to compare against").not.toBeNull();

    const source = readFileSync(file as string, "utf8");
    expect(source).toContain(`"${DUKE_SESSION_COOKIE}"`);
  });
});
