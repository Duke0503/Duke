/**
 * Structured logging, shared by the API and the voice agent.
 *
 * Enterprise logging is not "print some strings". It means:
 *   - every line is JSON, so a log tool can search and group it,
 *   - every line carries who/where (`service`, `env`) and which request it belongs to,
 *   - secrets are removed *before* they reach the stream,
 *   - the level is controlled by config, not by editing code,
 *   - logs outlive the container: rotated by date, and archived.
 *
 * Every line goes to **three** places:
 *
 *   1. **stdout** — Docker/the log collector owns shipping.
 *   2. **`logs/all/<service>.<date>.log`** — everything, the full story of a day.
 *   3. **`logs/error/<service>.<date>.log`** — errors only.
 *
 * Two files and not one because they answer different questions. When something is on fire
 * you want the short file; when you are working out *why* it caught fire you want the long
 * one. Filtering one huge file by hand every time is the thing this avoids.
 *
 * The split is done by pino itself: each `pino-roll` target has its own `level`, so the
 * error file is never even handed the debug lines.
 *
 * `log-archive.ts` gzips finished days from both folders to save disk.
 */

import { join } from "node:path";
import { pino, type Logger, type LoggerOptions } from "pino";

export type { Logger };

/** Folder for everything. */
export const LOG_ALL_DIRNAME = "all";
/** Folder for errors only. */
export const LOG_ERROR_DIRNAME = "error";
/** Both live folders, in the order a human would read them. */
export const LOG_DIRNAMES: readonly string[] = [LOG_ALL_DIRNAME, LOG_ERROR_DIRNAME];

/** The level the error-only file starts at. */
export const ERROR_FILE_LEVEL = "error";

export interface LoggerInput {
  /** Which process this is, e.g. "duke-api" or "duke-agent". */
  readonly service: string;
  /** Overrides LOG_LEVEL. */
  readonly level?: string;
  /** Force pretty (dev) or JSON (prod). Defaults to JSON when NODE_ENV=production. */
  readonly pretty?: boolean;
  /** Folder that holds the daily log folders. Empty/undefined disables file logging. */
  readonly logDir?: string;
}

/**
 * Fields that must never be written to a log file.
 * Applied by pino with a censor, so it cannot be forgotten at a call site.
 */
export const REDACT_PATHS: readonly string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "req.headers['x-livekit-token']",
  "res.headers['set-cookie']",
  "*.password",
  "*.passwordHash",
  "*.apiKey",
  "*.api_key",
  "*.apiSecret",
  "*.accessToken",
  "*.refreshToken",
  "*.token",
  "*.secret",
  "*.authorization",
];

export const REDACT_CENSOR = "[redacted]";

/** Rotated files pino-roll keeps before it starts deleting on its own. */
export const LOG_FILES_KEPT = 30;

/** The date pattern inside a rotated filename: `duke-api.2026-10-12.1.log`. */
export const LOG_DATE_FORMAT = "yyyy-MM-dd";

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export function resolveLogLevel(explicit?: string): string {
  const candidate = (explicit ?? process.env["LOG_LEVEL"] ?? "").toLowerCase();
  if ((LEVELS as readonly string[]).includes(candidate)) return candidate;
  return process.env["NODE_ENV"] === "production" ? "info" : "debug";
}

export function resolveLogDir(explicit?: string): string {
  return explicit ?? process.env["LOG_DIR"] ?? "logs";
}

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * pino-pretty is a devDependency, so it may not exist in a production install.
 * Check before asking pino to load it, otherwise the transport worker dies at
 * startup and the process logs nothing at all.
 */
function canLoadPretty(): boolean {
  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

interface TransportTarget {
  readonly target: string;
  readonly level: string;
  readonly options: Record<string, unknown>;
}

/** One file stream, rotated daily. */
const rollTarget = (level: string, dir: string, file: string): TransportTarget => ({
  target: "pino-roll",
  level,
  options: {
    file: join(dir, file),
    frequency: "daily",
    dateFormat: LOG_DATE_FORMAT,
    extension: ".log",
    mkdir: true,
    limit: { count: LOG_FILES_KEPT, removeOtherLogFiles: false },
  },
});

export function createLoggerOptions(input: LoggerInput): LoggerOptions {
  const level = resolveLogLevel(input.level);
  const wantsPretty = input.pretty ?? !isProduction();
  const logDir = resolveLogDir(input.logDir);

  const targets: TransportTarget[] = [];

  if (wantsPretty && canLoadPretty()) {
    targets.push({
      target: "pino-pretty",
      level,
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname,service,env",
      },
    });
  } else {
    // destination 1 = stdout
    targets.push({ target: "pino/file", level, options: { destination: 1 } });
  }

  if (logDir.length > 0) {
    // Everything, at the configured level.
    targets.push(rollTarget(level, join(logDir, LOG_ALL_DIRNAME), input.service));
    // Only errors. pino never hands this target anything below `error`.
    targets.push(rollTarget(ERROR_FILE_LEVEL, join(logDir, LOG_ERROR_DIRNAME), input.service));
  }

  return {
    name: input.service,
    level,
    redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
    base: {
      service: input.service,
      env: process.env["NODE_ENV"] ?? "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: { targets },
  } as LoggerOptions;
}

export function createLogger(input: LoggerInput): Logger {
  return pino(createLoggerOptions(input));
}

/** Bind values to every future line from this logger (e.g. a session id). */
export function withBindings(logger: Logger, bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

/** Turn any thrown value into something JSON-friendly with a real stack. */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause !== undefined ? { cause: serializeError(error.cause) } : {}),
    };
  }
  return { name: "NonError", message: String(error) };
}
