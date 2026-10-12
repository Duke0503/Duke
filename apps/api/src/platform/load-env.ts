/**
 * Reads `.env` before anything else in the process looks at a key.
 *
 * The import of this module in `main.ts` is **first**, and that position is load-bearing: pino
 * is built when `observability/logger.ts` is evaluated, and `LOG_LEVEL` and `LOG_DIR` come from
 * `.env`. Node evaluates imports in the order they are written, so reading the file here means
 * the logger is already looking at the file's settings.
 *
 * Nothing here throws — a missing `.env` is normal (see `loadEnvFiles`), and the API is designed
 * to boot without one and report what is missing.
 */

import { DEFAULT_ENV_PATHS, loadEnvFiles, type EnvFileReport } from "@duke/shared";

/** What was found, so `main.ts` can log it once the logger exists. */
export const envFileReport: EnvFileReport = loadEnvFiles(DEFAULT_ENV_PATHS);
