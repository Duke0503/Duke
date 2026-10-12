#!/usr/bin/env node
/**
 * Makes the value for `AUTH_PASSWORD_HASH`.
 *
 *     node scripts/hash-password.mjs "Admin@2026"
 *
 * Prints one line. Paste it into `.env`, replacing whatever `AUTH_PASSWORD_HASH` held, and
 * restart the API. The password itself is never stored anywhere — only this hash, which cannot
 * be turned back into it.
 *
 * Two things worth knowing:
 *
 *   1. Changing this line **signs you out everywhere**, on purpose. Sessions are signed with
 *      this value, so replacing it invalidates every cookie that came before.
 *   2. In PowerShell, put the password in **single quotes** if it contains `$`, or PowerShell
 *      will try to expand it as a variable.
 *
 * The hashing itself lives in `@duke/shared`, next to the code that checks it — this is only a
 * friendly way to call it, so there is exactly one implementation to trust.
 */

const hint = (message) => process.stderr.write(`${message}\n`);

let hashPassword;
try {
  ({ hashPassword } = await import("../packages/shared/dist/session.js"));
} catch {
  hint("Could not load @duke/shared. Run `pnpm build` first, then try again.");
  process.exit(1);
}

const password = process.argv.slice(2).join(" ");

if (password.length === 0) {
  hint('Usage: node scripts/hash-password.mjs "your password"');
  process.exit(1);
}

process.stdout.write(`AUTH_PASSWORD_HASH=${hashPassword(password)}\n`);
hint("Paste that line into .env, then restart: powershell -File scripts\\run-local.ps1 restart");
