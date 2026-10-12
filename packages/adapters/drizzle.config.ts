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
 * agent read it (`loadEnvFiles`, real environment wins, a missing file is not an error).
 */

import { loadEnvFiles } from "@duke/shared";
import { defineConfig } from "drizzle-kit";

loadEnvFiles([".env", "../../.env"]);

const url = process.env["DATABASE_URL"] ?? "";

if (url.length === 0) {
  // Not fatal at import time: `drizzle-kit --help` and a config typo should still be readable.
  // The first command that needs the database will say so with an explicit message.
  console.warn(
    "\nDATABASE_URL is not set. Copy .env.example to .env and paste the Postgres URL,\n" +
      "then run `pnpm run db:push` again (Supabase: Project -> Connect -> Connection string URI).\n",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/drizzle/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  // Print the statements it is about to run. This is a command you run by hand, and being able
  // to read what it did is worth more than a tidier terminal.
  verbose: true,
  strict: false,
});
