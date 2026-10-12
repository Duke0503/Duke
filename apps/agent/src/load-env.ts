/**
 * Reads `.env` before anything else in the process looks at a key. Same trick as the API: the
 * import is first in `main.ts` because the logger is built at import time and takes
 * `LOG_LEVEL` / `LOG_DIR` from the environment.
 */

import { DEFAULT_ENV_PATHS, loadEnvFiles, type EnvFileReport } from "@duke/shared";

/** What was found, so `main.ts` can log it once the logger exists. */
export const envFileReport: EnvFileReport = loadEnvFiles(DEFAULT_ENV_PATHS);
