/**
 * Read `.env` the way a person expects.
 *
 * The whole project is built so that **the last step is pasting keys**. That only works if the
 * keys are actually picked up, from whichever folder the process happens to start in, without
 * anyone remembering a flag. `resolveEnvPaths` is what makes that true: it anchors the search to
 * the code's own location as well as the working directory, so a process started from `C:\` still
 * finds the repo's `.env`.
 *
 * Why not `node --env-file`? Because then every way of starting Duke has to remember it:
 * `node --watch` in dev, `tsx` for the agent, Docker, a systemd unit. One of them eventually
 * will not. Loading it in code makes `.env` work the same everywhere.
 *
 * Rules, chosen to match Docker and every other tool:
 *
 *   - a variable already in the real environment WINS, so `GROQ_MODEL=x node dist/main.js`
 *     overrides the file and Compose's `environment:` beats `env_file:`,
 *   - a missing file is **not** an error, because the point of the lazy adapters is that the API
 *     boots with nothing set and tells you which key is still missing,
 *   - no expansion (`${OTHER}`), no command substitution, no escape sequences. Values are
 *     literal. Boring is the feature: a surprise here is a broken key at 2am.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface EnvFileReport {
  /** Paths that existed and were read, in order. */
  readonly loaded: readonly string[];
  /** Paths that were tried and were not there. Normal, not an error. */
  readonly missing: readonly string[];
  /** Variables the files actually set (so: not one the environment already had). */
  readonly applied: readonly string[];
  /** Variables skipped because the real environment already had them. */
  readonly overridden: readonly string[];
}

/**
 * Where to look for `.env`, **relative to the process's working directory**.
 *
 * Two entries on purpose: the service folders are `apps/api` and `apps/agent`, so a run from
 * inside a service finds its own `.env`, and a run from the repo root finds the shared one.
 *
 * These are only correct when the process starts in the right folder, which is why nothing in
 * the apps uses this directly any more — they call {@link resolveEnvPaths}, which adds an
 * anchor that does not move with the working directory. This list stays because it is the
 * documented, boring default, and it is what a test can reason about without a filesystem.
 */
export const DEFAULT_ENV_PATHS: readonly string[] = [".env", "../../.env"];

/** Files that exist at the top of this repo and nowhere below it. */
const ROOT_MARKERS: readonly string[] = ["pnpm-workspace.yaml", ".git"];

/** How far up to walk. Deep enough for `apps/api/dist/platform`, shallow enough to be bounded. */
const MAX_ROOT_DEPTH = 8;

/**
 * Walk up from a folder until something only the repo root has.
 *
 * `exists` is a parameter so the walk can be tested without a filesystem, which is the part of
 * this file worth testing: everything else is `readFileSync`.
 */
export function findRepoRoot(
  from: string,
  exists: (path: string) => boolean = existsSync,
): string | null {
  let dir = resolve(from);

  for (let depth = 0; depth < MAX_ROOT_DEPTH; depth += 1) {
    if (ROOT_MARKERS.some((marker) => exists(join(dir, marker)))) return dir;

    const parent = dirname(dir);
    // Top of the drive (or `/`): there is nothing above it to look at.
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * The `.env` candidates for a process whose code lives in `startDir`.
 *
 * **Two anchors, because one is not enough.** The working directory is how a developer expects
 * it (`pnpm --filter @duke/api start` from `apps/api`, `pnpm run db:push` from `packages/adapters`),
 * and the repo root is found by walking up from the *code's own folder*. Without the second one,
 * `node C:\\Duke\\apps\\api\\dist\\main.js` run from `C:\\` reads no file at all and reports every
 * key as missing — with the keys sitting right there in `.env`. That is not a hypothetical: it is
 * how this was found.
 *
 * Order is precedence, because {@link loadEnvFiles} lets the first file win: the working
 * directory, then its parent (the repo root, for a process started inside a service folder),
 * then the anchored root.
 */
export function resolveEnvPaths(
  startDir: string,
  cwd: string = process.cwd(),
  exists: (path: string) => boolean = existsSync,
): string[] {
  const candidates: string[] = [join(cwd, ".env"), join(cwd, "..", "..", ".env")];

  const root = findRepoRoot(startDir, exists);
  if (root !== null) candidates.push(join(root, ".env"));

  return dedupe(candidates);
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `KEY=value` lines to a map.
 *
 * Handles the small amount of syntax that real `.env` files use: comments, blank lines, an
 * optional `export ` prefix, and single or double quotes around a value.
 */
export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const equals = body.indexOf("=");
    if (equals <= 0) continue;

    const key = body.slice(0, equals).trim();
    if (!KEY_PATTERN.test(key)) continue;

    let value = body.slice(equals + 1).trim();
    const first = value.charAt(0);
    const quoted = (first === '"' || first === "'") && value.length >= 2 && value.endsWith(first);

    if (quoted) {
      // Take the value literally, quotes off.
      value = value.slice(1, -1);
    } else {
      // Strip a trailing ` # comment`, but only when it is separated by a space, so a `#`
      // inside a password is left alone.
      const comment = value.indexOf(" #");
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    values.set(key, value);
  }

  return values;
}

const dedupe = (values: readonly string[]): string[] => [...new Set(values)];

/**
 * Read the first files that exist and put their values into the environment.
 * Never throws: this runs before the app can report anything, so it must not be the thing
 * that takes the app down.
 */
export function loadEnvFiles(
  paths: readonly string[] = DEFAULT_ENV_PATHS,
  env: NodeJS.ProcessEnv = process.env,
): EnvFileReport {
  const loaded: string[] = [];
  const missing: string[] = [];
  const applied: string[] = [];
  const overridden: string[] = [];

  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      missing.push(path);
      continue;
    }
    loaded.push(path);

    for (const [key, value] of parseEnvFile(text)) {
      const existing = env[key];
      if (existing !== undefined && existing.trim().length > 0) {
        overridden.push(key);
        continue;
      }
      env[key] = value;
      applied.push(key);
    }
  }

  return {
    loaded,
    missing,
    applied: dedupe(applied),
    overridden: dedupe(overridden),
  };
}
