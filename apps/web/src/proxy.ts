/**
 * The optimistic half of the front door.
 *
 * Next runs this before a page renders and before `/api` is forwarded, so it is the cheapest
 * possible place to ask one question: is there a session cookie? If there is not, there is no
 * point rendering an app that cannot load anything, so the visitor is sent to the login screen.
 *
 * **It is not the lock.** It never sees the secret, so it cannot tell a real cookie from a made
 * up one, and it deliberately does not try — trying would mean putting the key in the web app.
 * `SessionGuard` in the API makes that decision, on the request that is about to touch data.
 * This file exists for two things a visitor actually notices: the login screen appearing by
 * itself, and an API call answering in the shape the app already understands.
 *
 * The matcher is the fiddly part. The paths that must work *before* signing in are excluded
 * (`/login`, `/api/auth/*`), and so is everything Next serves itself. Getting that wrong does
 * not look like a security bug, it looks like a styling bug: no CSS, no icon, no install prompt.
 */

import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  // An API call is *answered*, not redirected. A redirect would hand the app's fetch layer a
  // page of HTML to read as JSON, and the error would say "Unexpected token <".
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        statusCode: 401,
        code: "SESSION_REQUIRED",
        message: "Sign in to Duke first.",
        problems: [],
        path: pathname,
      },
      { status: 401 },
    );
  }

  const login = new URL(LOGIN_PATH, request.nextUrl);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static, _next/image  the app's own files
     *   favicon.ico, icon.svg, robots.txt, manifest.webmanifest  the tab and the install prompt
     *   login, api/auth/           the door itself
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|manifest.webmanifest|login|api/auth/).*)",
  ],
};
