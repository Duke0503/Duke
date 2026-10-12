/**
 * The front door: one signed cookie, one password hash.
 *
 * Duke runs on free tiers, so the thing worth protecting is not data — it is somebody else's
 * bill. Anyone who learns the address could invent a device id and spend the Groq, Deepgram and
 * Azure allowances. This file is what stands in front of that.
 *
 * Three decisions, all deliberate:
 *
 *   1. **Stateless.** The cookie is a signed payload, not a row in a table. There is nothing to
 *      clean up, nothing to lose, and restarting the API does not sign anybody out.
 *   2. **No dependencies.** HMAC and scrypt come from `node:crypto`. A session token is small
 *      enough that a library would be something else to audit rather than a risk removed.
 *   3. **Signed, not encrypted.** The token says who you are and cannot be edited, but anyone
 *      holding it can read it. So it carries a username and an expiry, and nothing else.
 *
 * Signing and verifying are **symmetric**: whatever the API signs, the API verifies. The web app
 * never sees the secret — it holds the cookie as an opaque string and asks the API for it.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * The cookie the browser holds after signing in.
 *
 * `apps/web/src/lib/auth.ts` repeats this name, because the web app has to know which cookie to
 * look for to decide whether to send someone to the login screen — and it must not import this
 * package into a browser bundle to find out. The API has a test that reads that file and fails
 * if the two names ever drift apart.
 */
export const DUKE_SESSION_COOKIE = "duke_session";

/**
 * How long a session lasts when `AUTH_SESSION_HOURS` says nothing.
 *
 * Thirty days. This is one person's phone: being asked to prove who you are every week is how a
 * habit dies. The value is a *setting*, not a rule — a shorter one is one line in `.env`.
 */
export const SESSION_HOURS_DEFAULT = 720;

export interface SessionPayload {
  readonly username: string;
  /** Unix milliseconds. */
  readonly expiresAt: number;
}

/** Why a session was not accepted. Kept apart so the log can say which. */
export type SessionRefusal = "missing" | "malformed" | "expired" | "forged";

export type SessionCheck =
  | { readonly ok: true; readonly username: string }
  | { readonly ok: false; readonly reason: SessionRefusal };

// ---------------------------------------------------------------- the cookie value

/**
 * The signature over the payload.
 *
 * The *hash of the password* is the key rather than a separate secret. It is already a long
 * random string, it never leaves `.env`, and using it here buys a property worth having:
 * changing the password invalidates every cookie that was signed with the old one — which is
 * exactly what someone changing a password expects to happen.
 */
const sign = (secret: string, body: string): string =>
  createHmac("sha256", secret).update(body).digest("base64url");

const encode = (payload: SessionPayload): string =>
  Buffer.from(JSON.stringify({ u: payload.username, exp: payload.expiresAt }), "utf8").toString(
    "base64url",
  );

/**
 * Turn a payload into the cookie's value: `<payload>.<signature>`.
 *
 * base64url is safe in a cookie and never contains a `.`, so the separator is unambiguous.
 */
export function signSession(secret: string, payload: SessionPayload): string {
  const body = encode(payload);
  return `${body}.${sign(secret, body)}`;
}

const isPayload = (value: unknown): value is { u: string; exp: number } => {
  if (typeof value !== "object" || value === null) return false;
  const { u, exp } = value as { u?: unknown; exp?: unknown };
  return typeof u === "string" && typeof exp === "number" && Number.isFinite(exp);
};

/**
 * Check a cookie value. Never throws: a browser can send anything at all, and a mangled cookie
 * is an ordinary event, not a crash.
 *
 * The signature is checked **before** the payload is looked at, so nothing that was not signed
 * by us is ever parsed into a session.
 */
export function verifySession(
  secret: string,
  token: string | undefined,
  now: number = Date.now(),
): SessionCheck {
  if (token === undefined || token.length === 0) return { ok: false, reason: "missing" };
  if (secret.length === 0) return { ok: false, reason: "missing" };

  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    return { ok: false, reason: "malformed" };
  }

  const body = token.slice(0, separator);
  if (!constantTimeEquals(token.slice(separator + 1), sign(secret, body))) {
    return { ok: false, reason: "forged" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!isPayload(parsed)) return { ok: false, reason: "malformed" };
  if (parsed.exp <= now) return { ok: false, reason: "expired" };

  return { ok: true, username: parsed.u };
}

// ---------------------------------------------------------------- the password

/**
 * Compare two strings without letting the time it takes say how much of a guess was right.
 *
 * Both sides are hashed first so the comparison is always over 32 bytes: `timingSafeEqual`
 * refuses different lengths, and a length check of its own would leak the same thing the
 * constant-time loop is there to hide.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash("sha256").update(Buffer.from(a, "utf8")).digest();
  const right = createHash("sha256").update(Buffer.from(b, "utf8")).digest();
  return timingSafeEqual(left, right);
}

/**
 * Hash a password for `AUTH_PASSWORD_HASH`. Format: `scrypt:<salt>:<hash>`, both base64url.
 *
 * scrypt is on purpose: it is deliberately slow, so a stolen `.env` is not a lookup away from
 * the password. The colon separator is on purpose too — `$` is special to shells and to Docker
 * Compose's own variable interpolation, and this value ends up inside `.env`.
 *
 * `scripts/hash-password.mjs` is the friendly way to call this.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

/** Check a password against a stored hash. A stored value that makes no sense is simply not a match. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [scheme, saltPart, hashPart] = parts as [string, string, string];
  if (scheme !== "scrypt" || saltPart.length === 0 || hashPart.length === 0) return false;

  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------- reading a request

/**
 * Pull one cookie out of a `Cookie` header.
 *
 * The API here is a plain HTTP layer, so this is a few lines of string work rather than a
 * dependency. A header that is absent, empty, or shaped oddly is simply "no cookie".
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined || header.length === 0) return undefined;

  for (const part of header.split(";")) {
    const equals = part.indexOf("=");
    if (equals <= 0) continue;
    if (part.slice(0, equals).trim() !== name) continue;
    return part.slice(equals + 1).trim();
  }

  return undefined;
}
