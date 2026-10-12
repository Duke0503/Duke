import { createLogger, type Logger } from "@duke/shared";

/**
 * The one logger for the API process.
 *
 * Startup happens before DI exists, so this is a plain module-level instance;
 * `PinoLoggerService` hands the same instance to Nest.
 *
 * The explicit `: Logger` annotation matters: without it, TypeScript infers a type
 * that points into pnpm's nested store and the build fails to emit portable typings.
 */
export const logger: Logger = createLogger({ service: "duke-api" });
