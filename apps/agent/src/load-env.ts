/**
 * Reads `.env` before anything else in the process looks at a key. Same trick as the API: the
 * import is first in `main.ts` because the logger is built at import time and takes
 * `LOG_LEVEL` / `LOG_DIR` from the environment.
 */

import { loadEnvFiles, resolveEnvPaths, type EnvFileReport } from "@duke/shared";

/**
 * What was found, so `main.ts` can log it once the logger exists.
 *
 * Anchored with `__dirname` for the same reason as the API: the file is found from wherever the
 * worker was started, which is not always the repo root.
 */
export const envFileReport: EnvFileReport = loadEnvFiles(resolveEnvPaths(__dirname));
