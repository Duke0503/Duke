/**
 * Signing in.
 *
 * The password in these tests is the one this project was set up with; the hash is generated
 * here rather than pasted, so the tests exercise the same scrypt code the API runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifySession } from "@duke/shared";
import { AuthService } from "./auth.service";

const PASSWORD = "Admin@2026";
/** One hash for the whole file: scrypt is deliberately slow, and these tests do not need salts. */
const SECRET = hashPassword(PASSWORD);

const configure = (overrides: Record<string, string> = {}): void => {
  vi.stubEnv("AUTH_USERNAME", "admin");
  vi.stubEnv("AUTH_PASSWORD_HASH", SECRET);
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AuthService.login", () => {
  it("hands back a token that verifies, for the right person", () => {
    configure();
    const view = new AuthService().login({ username: "admin", password: PASSWORD });

    expect(view.username).toBe("admin");
    expect(verifySession(SECRET, view.token)).toEqual({ ok: true, username: "admin" });
  });

  it("gives the token an expiry, and it is in the future", () => {
    configure();
    const view = new AuthService().login({ username: "admin", password: PASSWORD });

    expect(view.expiresAt).toBeGreaterThan(Date.now());
    expect(verifySession(SECRET, view.token, view.expiresAt + 1)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("honours AUTH_SESSION_HOURS", () => {
    configure({ AUTH_SESSION_HOURS: "1" });
    const before = Date.now();
    const view = new AuthService().login({ username: "admin", password: PASSWORD });

    expect(view.expiresAt).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 5_000);
    expect(view.expiresAt).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 5_000);
  });

  it("defaults to thirty days when nothing says otherwise", () => {
    configure();
    const view = new AuthService().login({ username: "admin", password: PASSWORD });
    const days = (view.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);

    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("refuses the wrong password, and says nothing about which half was wrong", () => {
    configure();
    const service = new AuthService();

    for (const attempt of [
      { username: "admin", password: "admin@2026" },
      { username: "admin", password: "" },
      { username: "Admin", password: PASSWORD },
      { username: "someone", password: PASSWORD },
    ]) {
      expect(() => service.login(attempt)).toThrowError(/not right/);
    }
  });

  it("never puts the password in the answer", () => {
    configure();
    const view = new AuthService().login({ username: "admin", password: PASSWORD });

    expect(JSON.stringify(view)).not.toContain(PASSWORD);
  });

  it("says which key is missing when the door has not been set up", () => {
    vi.stubEnv("AUTH_USERNAME", "");
    vi.stubEnv("AUTH_PASSWORD_HASH", "");

    expect(() => new AuthService().login({ username: "admin", password: PASSWORD })).toThrowError(
      /AUTH_USERNAME is not set/,
    );

    vi.stubEnv("AUTH_USERNAME", "admin");
    expect(() => new AuthService().login({ username: "admin", password: PASSWORD })).toThrowError(
      /AUTH_PASSWORD_HASH is not set/,
    );
  });

  it("signs sessions with the password hash, so changing the password ends them", () => {
    configure();
    const service = new AuthService();
    const before = service.login({ username: "admin", password: PASSWORD }).token;

    // Someone changes AUTH_PASSWORD_HASH. Every cookie signed with the old one is now worthless.
    vi.stubEnv("AUTH_PASSWORD_HASH", `${SECRET}x`);
    expect(verifySession(`${SECRET}x`, before).ok).toBe(false);
  });
});
