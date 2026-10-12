import { Injectable, type LoggerService } from "@nestjs/common";
import type { Logger } from "@duke/shared";

type Level = "info" | "error" | "warn" | "debug" | "trace";

/**
 * Sends Nest's own logs (`NestFactory`, `InstanceLoader`, module logs, ...) through
 * pino, so framework noise and our own logs share one format, one level and one file.
 * Without this, Nest prints coloured text while we print JSON — two log streams.
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("trace", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  private write(level: Level, message: unknown, optionalParams: unknown[]): void {
    // Nest calls these as (message) | (message, context) | (message, stack, context).
    const strings = optionalParams.filter((value): value is string => typeof value === "string");
    const context = strings.at(-1);
    const stack = strings.length > 1 ? strings.at(-2) : undefined;

    const fields: Record<string, unknown> = {};
    if (context !== undefined) fields["context"] = context;
    if (stack !== undefined) fields["stack"] = stack;
    if (typeof message !== "string") fields["value"] = message;

    this.dispatch(level, fields, typeof message === "string" ? message : "log");
  }

  private dispatch(level: Level, fields: Record<string, unknown>, text: string): void {
    switch (level) {
      case "info":
        this.logger.info(fields, text);
        break;
      case "error":
        this.logger.error(fields, text);
        break;
      case "warn":
        this.logger.warn(fields, text);
        break;
      case "debug":
        this.logger.debug(fields, text);
        break;
      case "trace":
        this.logger.trace(fields, text);
        break;
    }
  }
}
