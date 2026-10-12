import { describe, expect, it } from "vitest";
import {
  DUKE_SESSION_COOKIE,
  constantTimeEquals,
  hashPassword,
  readCookie,
  signSession,
  verifySession,
  verifyPassword,
} from "./session";

const SECRET = hashPassword("a password worth hashing");
const NOW = 1_800_000_000_000;

const fresh = () => signSession(SECRET, { username: "admin", expiresAt: NOW + 60_000 });

describe("signSession / verifySession", () => {
  it("accepts what it just signed, and knows who it is", () => {
    const check = verifySession(SECRET, fresh(), NOW);
    expect(check).toEqual({ ok: true, username: "admin" });
  });

  it("refuses a token signed with a different secret", () => {
    const other = signSession(hashPassword("somebody else's password"), {
      username: "admin",
      expiresAt: NOW + 60_000,
    });
    expect(verifySession(SECRET, other, NOW)).toEqual({ ok: false, reason: "forged" });
  });

  it("refuses an edited payload — the signature covers it", () => {
    const token = fresh();
    const [body, signature] = token.split(".") as [string, string];
    const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    claim["u"] = "someone-else";
    const edited = Buffer.from(JSON.stringify(claim), "utf8").toString("base64url");

    expect(verifySession(SECRET, `${edited}.${signature}`, NOW)).toEqual({
      ok: false,
      reason: "forged",
    });
  });

  it("refuses an edited signature", () => {
    const body = fresh().split(".")[0] as string;
    expect(verifySession(SECRET, `${body}.notasignature`, NOW)).toEqual({
      ok: false,
      reason: "forged",
    });
  });

  it("treats an expired session as expired, not as forged", () => {
    const token = signSession(SECRET, { username: "admin", expiresAt: NOW - 1 });
    expect(verifySession(SECRET, token, NOW)).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts a session that has not expired yet", () => {
    const token = signSession(SECRET, { username: "admin", expiresAt: NOW + 1 });
    expect(verifySession(SECRET, token, NOW).ok).toBe(true);
  });

  it("answers 'missing' for an absent or empty cookie", () => {
    expect(verifySession(SECRET, undefined, NOW)).toEqual({ ok: false, reason: "missing" });
    expect(verifySession(SECRET, "", NOW)).toEqual({ ok: false, reason: "missing" });
  });

  it("refuses to work without a secret rather than signing in anyway", () => {
    expect(verifySession("", fresh(), NOW)).toEqual({ ok: false, reason: "missing" });
  });

  it.each(["nodots", "a.", ".b", "...", "..", "%%%.%%%"])(
    "answers 'malformed' for %j rather than throwing",
    (token) => {
      const check = verifySession(SECRET, token, NOW);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(["malformed", "forged"]).toContain(check.reason);
    },
  );

  it("keeps a username that is not a simple word", () => {
    const name = "Đức — admin 🙂";
    const check = verifySession(SECRET, signSession(SECRET, { username: name, expiresAt: NOW + 1 }), NOW);
    expect(check).toEqual({ ok: true, username: name });
  });

  it("carries no signature the payload could be read from — it is signed, not secret", () => {
    // Stated as a test so nobody mistakes this for encryption later: the username is readable
    // by anyone holding the cookie. It is not a secret; the *authority* to be that user is.
    const body = fresh().split(".")[0] as string;
    expect(Buffer.from(body, "base64url").toString("utf8")).toContain("admin");
  });
});

describe("constantTimeEquals", () => {
  it("matches equal strings, including empty ones", () => {
    expect(constantTimeEquals("", "")).toBe(true);
    expect(constantTimeEquals("duke", "duke")).toBe(true);
  });

  it("separates anything else, whatever the length", () => {
    expect(constantTimeEquals("duke", "dukE")).toBe(false);
    expect(constantTimeEquals("duke", "dukes")).toBe(false);
    expect(constantTimeEquals("duke", "")).toBe(false);
    expect(constantTimeEquals("", "duke")).toBe(false);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("accepts the right password", () => {
    expect(verifyPassword("Admin@2026", hashPassword("Admin@2026"))).toBe(true);
  });

  it("refuses the wrong one", () => {
    const stored = hashPassword("Admin@2026");
    expect(verifyPassword("admin@2026", stored)).toBe(false);
    expect(verifyPassword("Admin@2026 ", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently twice", () => {
    expect(hashPassword("same")).not.toEqual(hashPassword("same"));
  });

  it("stores something that cannot be read back, and no dollar signs", () => {
    const stored = hashPassword("Admin@2026");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(stored).not.toContain("Admin@2026");
    // `$` is special to shells and to Compose's own interpolation; the value lives in .env.
    expect(stored).not.toContain("$");
  });

  it("says no to a stored value that makes no sense, instead of throwing", () => {
    for (const stored of ["", "scrypt", "bcrypt:a:b", "scrypt::", "scrypt:!!!:!!!", ":::"]) {
      expect(verifyPassword("Admin@2026", stored)).toBe(false);
    }
  });
});

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    const header = "theme=dark; duke_session=abc.def; other=1";
    expect(readCookie(header, DUKE_SESSION_COOKIE)).toBe("abc.def");
  });

  it("finds it when it is the only one, and when it has whitespace around it", () => {
    expect(readCookie("duke_session=abc", DUKE_SESSION_COOKIE)).toBe("abc");
    expect(readCookie("  duke_session = abc  ", DUKE_SESSION_COOKIE)).toBe("abc");
  });

  it("does not confuse a cookie whose name merely ends the same way", () => {
    expect(readCookie("not_duke_session=abc", DUKE_SESSION_COOKIE)).toBeUndefined();
  });

  it("answers nothing for an absent, empty or junk header", () => {
    expect(readCookie(undefined, DUKE_SESSION_COOKIE)).toBeUndefined();
    expect(readCookie("", DUKE_SESSION_COOKIE)).toBeUndefined();
    expect(readCookie("garbage", DUKE_SESSION_COOKIE)).toBeUndefined();
    expect(readCookie("=abc", DUKE_SESSION_COOKIE)).toBeUndefined();
  });

  it("keeps the name the API and the web app both look for", () => {
    // The web app repeats this string in apps/web/src/lib/auth.ts. Changing it here without
    // changing it there is the bug this line is here to make loud.
    expect(DUKE_SESSION_COOKIE).toBe("duke_session");
  });
});
