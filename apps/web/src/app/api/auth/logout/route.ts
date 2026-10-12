/**
 * Signing out.
 *
 * A session is a signed cookie and nothing else, so leaving is just throwing it away — there is
 * no row on the server to delete, and nothing to remember. The cookie is removed with the same
 * path it was set with; a cookie deleted at a different path is a cookie the browser keeps
 * sending.
 */

import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
