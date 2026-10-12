/**
 * How the database tables get created.
 *
 * Duke has exactly one source of truth for its schema: `src/drizzle/schema.ts`. There is no
 * hand-written SQL and no committed migration folder to fall out of step with the code —
 * `pnpm run db:push` reads the schema files, compares them with the live database, and applies
 * the difference.
 *
 * That is the right trade for one person and one database. The day there is a second
 * deployment, the same config grows `out: "./drizzle"` and the workflow becomes
 * `drizzle-kit generate` + `migrate` — the schema file does not change either way.
 *
 * The `.env` is read here rather than by drizzle-kit, so it is read the same way the API and the
 * agent read it (`loadEnvFiles`, real environment wins, a missing file is not an error). Anchored
 * with `__dirname`, so `pnpm run db:push` from the repo root and a `drizzle-kit` run from
 * anywhere else both read the same file.
 */

import { join } from "node:path";
import { loadEnvFiles, resolveEnvPaths } from "@duke/shared";
import { defineConfig } from "drizzle-kit";

loadEnvFiles(resolveEnvPaths(__dirname));

const url = process.env["DATABASE_URL"] ?? "";

if (url.length === 0) {
  // Not fatal at import time: `drizzle-kit --help` and a config typo should still be readable.
  // The first command that needs the database will say so with an explicit message.
  console.warn(
    "\nDATABASE_URL is not set. Copy .env.example to .env and paste the Postgres URL,\n" +
      "then run `pnpm run db:push` again (Supabase: Project -> Connect -> Connection string URI).\n",
  );
}

/**
 * Where the schema file is, as drizzle-kit needs to be told it.
 *
 * Two things had to be discovered by running this from `C:\` instead of from the package folder,
 * and neither is guessing:
 *
 *   1. `schema` is resolved against the **working directory**, so a relative path only works when
 *      drizzle-kit is started inside `packages/adapters` — which is what `pnpm run db:push` does,
 *      and why nobody noticed;
 *   2. an absolute **Windows** path has to use forward slashes. With backslashes it silently
 *      reports "No schema files found" (it globs), while `out` is the opposite — it is joined to
 *      the working directory, where forward slashes end up as `C:\C:\...`.
 */
const schemaPath = join(__dirname, "src", "drizzle", "schema.ts").replaceAll("\\", "/");

export default defineConfig({
  dialect: "postgresql",
  schema: schemaPath,
  // Relative on purpose. `out` is only read by `drizzle-kit generate` — the migration workflow
  // Duke deliberately does not use (`push` never looks at it) — and drizzle-kit both joins *and*
  // resolves it against the working directory depending on where it is written, so an absolute
  // value produces a mangled path like `...\adapters\C:\Project\...`. Relative is correct
  // whenever `generate` is run from this package, which is where it belongs.
  out: "./drizzle",
  dbCredentials: { url },
  // Print the statements it is about to run. This is a command you run by hand, and being able
  // to read what it did is worth more than a tidier terminal.
  verbose: true,
  strict: false,
});
