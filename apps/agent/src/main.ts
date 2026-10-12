import { MOOD_TO_STYLE } from "@duke/core";
import { createLogger, resolveLogDir, serializeError, startLogMaintenance } from "@duke/shared";

const logger = createLogger({ service: "duke-agent" });
const DEFAULT_LOG_RETENTION_DAYS = 14;

/**
 * M1 turns this into the real worker:
 *
 *   join the LiveKit room
 *     -> Deepgram   (SpeechToText)
 *     -> Groq       (Brain)
 *     -> Azure      (Voice, with the mood -> emotion map)
 *     -> barge-in
 *
 * It only makes OUTBOUND connections, so it needs no inbound ports on the VPS.
 * The agent shares the API's log shape, so a conversation can be traced in one file.
 */
function main(): void {
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

  logger.info(
    { moods: Object.keys(MOOD_TO_STYLE).length, logDir, pid: process.pid },
    "duke-agent placeholder up",
  );

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "shutting down");
    maintenance.stop();
    logger.flush(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
