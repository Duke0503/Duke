import "reflect-metadata";
// Must stay first among the local imports: it reads .env, and the logger below is built at
// import time from LOG_LEVEL / LOG_DIR.
import { envFileReport } from "./platform/load-env";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { pinoHttp } from "pino-http";
import {
  inspectEnv,
  resolveLogDir,
  serializeError,
  startLogMaintenance,
  summarizeEnv,
} from "@duke/shared";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./observability/all-exceptions.filter";
import { logger } from "./observability/logger";
import { PinoLoggerService } from "./observability/pino-logger.service";

const DEFAULT_LOG_RETENTION_DAYS = 14;

async function bootstrap(): Promise<void> {
  // bufferLogs: hold Nest's startup lines until our logger is installed, so the
  // very first line is already JSON in the right shape.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new PinoLoggerService(logger));
  app.flushLogs();

  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env["WEB_ORIGIN"] ?? "http://localhost:3000" });

  app.use(
    pinoHttp({
      logger,
      // One id follows a request everywhere: logs, error body, response header.
      genReqId: (req, res) => {
        const header = req.headers["x-request-id"];
        const id = typeof header === "string" && header.length > 0 ? header : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      // Health probes must not flood the log file.
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      customLogLevel: (_req, res, err) => {
        if (err !== undefined && err !== null) return "error";
        if (res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage: (req, res) => `${req.method ?? "-"} ${req.url ?? "-"} -> ${res.statusCode}`,
      customErrorMessage: (req, res) => `${req.method ?? "-"} ${req.url ?? "-"} -> ${res.statusCode}`,
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();

  const logDir = resolveLogDir();
  const maintenance = startLogMaintenance(
    { logDir, retentionDays: Number(process.env["LOG_RETENTION_DAYS"] ?? DEFAULT_LOG_RETENTION_DAYS) },
    (report) => {
      if (report.compressed.length > 0 || report.deleted.length > 0) {
        logger.info(report, "log archive pass finished");
      }
    },
    (error) => logger.warn({ err: serializeError(error) }, "log archive pass failed"),
  );

  // One line per boot saying whether Duke can actually work yet, and which key is still
  // missing. Pasting keys is the last step of this project; this is the line that confirms it
  // worked, instead of finding out three screens deep in a call.
  const env = inspectEnv();
  logger.info(
    { ready: env.ready, missing: env.missing, placeholders: env.placeholders },
    summarizeEnv(env),
  );
  logger.info(envFileReport, "environment files");

  const port = Number(process.env["API_PORT"] ?? 3001);
  await app.listen(port);
  logger.info({ port, logDir, pid: process.pid }, "duke-api listening");

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "shutting down");
    maintenance.stop();
    void app.close().finally(() => logger.flush(() => process.exit(0)));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: serializeError(reason) }, "unhandled promise rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: serializeError(error) }, "uncaught exception");
    logger.flush(() => process.exit(1));
  });
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ err: serializeError(error) }, "duke-api failed to start");
  logger.flush(() => process.exit(1));
});
