/**
 * Signing in, from the browser's side.
 *
 * The login form posts the two fields here. This forwards them to the API and — if the API
 * agrees — sets the cookie and answers with nothing but `ok`. **The token never reaches the
 * page.** It comes back from the API in a JSON body that only this handler reads, and leaves in
 * an HttpOnly cookie, so no script in the browser can see it, read it, or copy it.
 *
 * That is the whole reason this route exists instead of letting the form call the API directly:
 * a token in a body is a token a script can steal, and HttpOnly is a decision that has to be
 * made on this side of the wire.
 *
 * The path is `/api/auth/login`, which is also where the API's own login lives. This file wins:
 * Next checks the filesystem before it applies the rewrite in `next.config.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const API_ORIGIN = process.env["API_ORIGIN"] ?? "http://127.0.0.1:3001";

/**
 * Is the phone talking to us over https?
 *
 * Behind the Cloudflare tunnel this process sees plain http — Cloudflare has already terminated
 * TLS — so the header the tunnel sets is the only honest answer. It is not cosmetic: a `Secure`
 * cookie sent over http is dropped by the browser, and the login would look like it worked and
 * then not.
 */
function isSecure(request: NextRequest): boolean {
  const proto = request.headers.get("x-forwarded-proto") ?? "";
  return proto.split(",")[0]?.trim().toLowerCase() === "https";
}

interface LoginAnswer {
  readonly token?: unknown;
  readonly expiresAt?: unknown;
  readonly username?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  let answer: Response;
  try {
    answer = await fetch(`${API_ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        statusCode: 503,
        code: "API_UNREACHABLE",
        message: "Duke's own server is not answering. Is it running?",
        problems: [],
      },
      { status: 503 },
    );
  }

  const payload = (await answer.json().catch(() => null)) as (LoginAnswer & { code?: string; message?: string }) | null;

  const token = payload?.token;
  const expiresAt = payload?.expiresAt;

  if (!answer.ok || typeof token !== "string" || typeof expiresAt !== "number") {
    // Whatever the API said goes back untouched — its `message` is written for a person, and
    // the login screen shows it rather than inventing a second sentence for the same event.
    return NextResponse.json(
      payload ?? { code: "LOGIN_FAILED", message: "Could not sign in." },
      { status: answer.ok ? 502 : answer.status },
    );
  }

  const response = NextResponse.json({
    ok: true,
    username: typeof payload?.username === "string" ? payload.username : "",
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure(request),
    expires: new Date(expiresAt),
  });

  return response;
}
