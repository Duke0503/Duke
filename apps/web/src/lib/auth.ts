/**
 * The front door's browser half.
 *
 * Two facts and one rule.
 *
 *  1. **The name of the cookie.** The API sets it and verifies it; the web app only needs to
 *     know which cookie to look for, so it can send you to the login screen instead of showing a
 *     shell that cannot load anything. `packages/shared/src/session.ts` holds the same string,
 *     and a test in the API reads this file and fails if the two ever drift apart.
 *  2. **No secret lives here.** The web app never sees the signing key, so it cannot tell a real
 *     cookie from a forged one, and it does not pretend to. The API decides that before it reads
 *     or writes anything private.
 *  3. **A redirect target must be a path on this site.** `safeNext` is that rule.
 */

/** Must match `DUKE_SESSION_COOKIE` in `packages/shared/src/session.ts`. */
export const SESSION_COOKIE = "duke_session";

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

/**
 * Where to send someone after they sign in.
 *
 * The value arrives as `?next=` on the login URL, written by the proxy, and it ends up in a
 * redirect — so it is only ever allowed to be a path on this site. `https://somewhere-else` and
 * `//somewhere-else` are both read by a browser as another host, and a redirect with a newline
 * in it is not worth thinking about either. Anything else falls back to Home.
 */
export function safeNext(value: string | null | undefined, fallback: string = HOME_PATH): string {
  if (value === null || value === undefined) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (/[\r\n\t]/.test(value)) return fallback;
  return value;
}
