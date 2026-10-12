/**
 * The LiveKit worker.
 *
 * LiveKit Cloud calls the API, the API opens a room named `duke-<sessionId>` and asks for
 * an agent by name, and this process is what answers. One process per call.
 *
 * The shape of a call:
 *
 *   connect -> wait for the phone -> read the brief from Redis
 *     -> Deepgram (ears) -> Groq (brain) -> Azure (voice, with the mood)
 *
 * Nothing here re-derives the personality or the voice. The brief is the single source of
 * truth, written by the API, so there is one implementation of the prompt rules and not two.
 *
 * It only makes OUTBOUND connections, so it needs no open port on the VPS.
 *
 * Run it with `node dist/main.js start`. That `start` is the framework's own subcommand, not a
 * npm script: without it the CLI prints its help and exits.
 */

// Must stay first: it reads .env, and the logger below is built at import time from
// LOG_LEVEL / LOG_DIR.
import { envFileReport } from "./load-env";

import { cli, defineAgent, ServerOptions, VAD, voice } from "@livekit/agents";
import type { JobContext, JobProcess } from "@livekit/agents";
import { STT as DeepgramStt } from "@livekit/agents-plugin-deepgram";
import { LLM } from "@livekit/agents-plugin-openai";
import { VAD as SileroVad } from "@livekit/agents-plugin-silero";
import { createAdapters, type Adapters } from "@duke/adapters";
import {
  createLogger,
  inspectEnv,
  optionalEnv,
  requireEnv,
  resolveLogDir,
  serializeError,
  startLogMaintenance,
} from "@duke/shared";
import type { Logger } from "@duke/shared";
import { AzureTts } from "./azure-tts";
import { readBrief, sessionIdFromRoom } from "./brief";
import { DukeAgent } from "./duke-agent";
import { TurnRecorder } from "./recorder";

const DEFAULT_DEEPGRAM_MODEL = "nova-2";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_LOG_RETENTION_DAYS = 14;

/** The job process carries the loaded VAD between calls. */
interface ProcessData extends Record<string, unknown> {
  vad?: VAD;
}

export default defineAgent<ProcessData>({
  /**
   * Loading the ONNX model takes about a second. Doing it here means the first call after a
   * boot does not pay for it.
   */
  prewarm: async (proc: JobProcess<ProcessData>): Promise<void> => {
    proc.userData.vad = await SileroVad.load();
  },

  entry: async (ctx: JobContext<ProcessData>): Promise<void> => {
    await runCall(ctx);
  },
});

/** Everything one call needs, torn down together at the end. */
async function runCall(ctx: JobContext<ProcessData>): Promise<void> {
  const log = createLogger({ service: "duke-agent" }).child({ room: ctx.room.name });

  const adapters = createAdapters({
    onError: (error) => log.warn({ err: serializeError(error) }, "provider complained"),
  });

  try {
    await answerCall(ctx, adapters, log);
  } catch (error) {
    log.error({ err: serializeError(error) }, "call failed");
    await adapters.close().catch(() => undefined);
    throw error;
  }
}

async function answerCall(
  ctx: JobContext<ProcessData>,
  adapters: Adapters,
  log: Logger,
): Promise<void> {
  const roomName = ctx.room.name ?? "";
  const sessionId = sessionIdFromRoom(roomName);
  if (sessionId === null) {
    log.error({ roomName }, "room is not a Duke room; refusing the job");
    return;
  }

  // The brief first: if the call cannot be briefed, it cannot be a call, and we should not
  // make the person listen to silence while we find that out.
  const brief = await readBrief(adapters.cache, roomName);
  if (brief === null) {
    log.error({ sessionId }, "no session brief in Redis; the call cannot be briefed");
    return;
  }

  // The usage counters are keyed by user, and the brief does not carry the owner.
  const row = await adapters.sessions.getById(sessionId);
  if (row === null) {
    log.error({ sessionId }, "session row is gone; the call cannot be recorded");
    return;
  }

  await ctx.connect();
  await ctx.waitForParticipant();

  const recorder = new TurnRecorder({
    sessions: adapters.sessions,
    cache: adapters.cache,
    clock: adapters.clock,
    userId: row.userId,
    sessionId,
    onError: (error) => log.warn({ err: serializeError(error) }, "could not record the call"),
  });

  const azureTts = new AzureTts({
    voice: adapters.voice,
    voiceId: brief.voiceId,
    onError: (error) => log.warn({ err: serializeError(error) }, "voice complained"),
  });

  const stt = new DeepgramStt({
    apiKey: requireEnv("DEEPGRAM_API_KEY"),
    model: optionalEnv("DEEPGRAM_MODEL", DEFAULT_DEEPGRAM_MODEL),
    language: "en",
    interimResults: true,
    punctuate: true,
    smartFormat: true,
    noDelay: true,
  });

  const llm = LLM.withGroq({
    apiKey: requireEnv("GROQ_API_KEY"),
    model: optionalEnv("GROQ_MODEL", DEFAULT_GROQ_MODEL),
  });

  const session = new voice.AgentSession({
    // Pretrained in `prewarm`; loaded here only if that did not happen.
    vad: ctx.proc.userData.vad ?? (await SileroVad.load()),
    stt,
    llm,
    tts: azureTts,
    // Barge-in: the person can cut the character off mid-sentence, like a real call.
    turnHandling: { interruption: { enabled: true } },
  });

  // Every finished line, from either side, is written down. The character's side arrives
  // already stripped of its mood tag, because `llmNode` removed it upstream.
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
    const item = event.item;
    // A handoff item has no `role`; nobody said it out loud.
    if (!("role" in item)) return;
    if (item.role !== "user" && item.role !== "assistant") return;
    recorder.record(item.role === "user" ? "user" : "character", item.textContent ?? "");
  });

  // Token counts, for the usage screen. Not every metric is an LLM metric, so read carefully.
  session.on(voice.AgentSessionEventTypes.MetricsCollected, (event) => {
    const metrics = event.metrics as unknown as {
      promptTokens?: number;
      completionTokens?: number;
    };
    recorder.addTokens((metrics.promptTokens ?? 0) + (metrics.completionTokens ?? 0));
  });

  session.on(voice.AgentSessionEventTypes.Error, (event) => {
    log.error({ err: serializeError(event.error) }, "the voice loop hit an error");
  });

  ctx.addShutdownCallback(async (): Promise<void> => {
    log.info({ sessionId }, "call ended");
    await session.close();
    await recorder.flush();
    await adapters.close();
  });

  await session.start({ agent: new DukeAgent(brief, azureTts), room: ctx.room });

  log.info(
    { sessionId, character: brief.characterName, voice: brief.voiceId, savage: brief.savage },
    "call started",
  );

  // The character picks up the phone first. Waiting for playout keeps the greeting from racing
  // whatever the person says the moment they hear something.
  await session.generateReply({ instructions: brief.greetingPrompt }).waitForPlayout();
}

// ------------------------------------------------------------------------------ the process

const logger = createLogger({ service: "duke-agent" });
logger.info(envFileReport, "environment files");
logger.info({ logDir: resolveLogDir(), pid: process.pid }, "duke-agent booting");

// Log upkeep — gzip yesterday, delete what is too old — must run once per host, not once per
// process. The framework forks a child per call and re-imports this file there, so this is the
// parent worker only: in the child, `require.main` is the framework's own launcher.
if (require.main === module) {
  const maintenance = startLogMaintenance(
    {
      logDir: resolveLogDir(),
      retentionDays: Number(optionalEnv("LOG_RETENTION_DAYS", String(DEFAULT_LOG_RETENTION_DAYS))),
    },
    (report) => {
      if (report.compressed.length > 0 || report.deleted.length > 0) {
        logger.info(report, "log archive pass finished");
      }
    },
    (error) => logger.warn({ err: serializeError(error) }, "log archive pass failed"),
  );

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "shutting down");
    maintenance.stop();
    logger.flush(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// A worker without LiveKit keys cannot answer anything, and the framework's own complaint is a
// stack trace. Say it in one line first, the same way the API does, and let the process restart
// once the keys are in.
const env = inspectEnv();
if (!env.ready) {
  logger.error(
    { missing: env.missing, placeholders: env.placeholders },
    "duke-agent cannot start: fill in these keys in .env (see .env.example), then start it again",
  );
  process.exit(1);
}

cli.runApp(
  new ServerOptions({
    // The framework forks a child per call and imports this file there, so the path must be
    // the real one. CommonJS output — `__dirname` exists, `import.meta` does not.
    agent: __filename,
    // One idle process kept warm; more would just hold RAM on a small VPS.
    numIdleProcesses: Number(optionalEnv("LIVEKIT_IDLE_PROCESSES", "1")),
  }),
);
