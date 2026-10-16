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
 * It only makes OUTBOUND connections, so it needs no open port on the VPS. The one server it
 * does start (the framework's own health/load endpoint) is pinned to `127.0.0.1` below, so it
 * is reachable from this machine and nowhere else.
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
import { DEFAULT_AGENT_NAME, createAdapters, type Adapters } from "@duke/adapters";
import {
  DEFAULT_DEEPGRAM_MODEL,
  DEFAULT_GROQ_MODEL,
  createLogger,
  groqReasoningEffort,
  inspectEnv,
  optionalEnv,
  requireEnv,
  resolveLogDir,
  serializeError,
  startLogMaintenance,
  type GroqReasoningEffort,
} from "@duke/shared";
import type { Logger } from "@duke/shared";
import { AzureTts } from "./azure-tts";
import { readBrief, sessionIdFromRoom } from "./brief";
import { DukeAgent } from "./duke-agent";
import { DEFAULT_CALL_IDLE_SECONDS, IdleWatch, idleSecondsFrom } from "./idle-watch";
import { TurnRecorder } from "./recorder";

const DEFAULT_LOG_RETENTION_DAYS = 14;

/**
 * What the character says before the countdown hangs up.
 *
 * An instruction rather than a script, so the line goes through the same model and the same
 * personality as everything else and sounds like the character instead of like a phone system.
 * It is told not to ask a question on purpose: the call is ending, and a question nobody will
 * answer is only a reason to stay open and keep spending.
 */
const IDLE_GOODBYE_INSTRUCTION = [
  "Nobody has said anything for a while, so you are hanging up the call now.",
  "Say one short, natural goodbye, in character, and tell them they can call back any time.",
  "Do not ask a question.",
].join(" ");

/**
 * `withGroq` spreads what it is given straight into `new LLM(...)`, where `reasoningEffort` is a
 * real, documented option — the factory's own type just leaves it out, so TypeScript rejects the
 * property even though the SDK reads it. Widening the object here is the smallest way to say
 * that, and it keeps the Groq base URL and the `GROQ_API_KEY` fallback coming from the vendor
 * instead of being copied into this file.
 */
type GroqOptions = NonNullable<Parameters<typeof LLM.withGroq>[0]> & {
  readonly reasoningEffort?: GroqReasoningEffort;
};

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
  // `ctx.job.room` is the room this job was called into. Not `ctx.room.name`: that Room is a bare
  // object until `ctx.connect()` fills it in from the server's answer, so before connecting it
  // reads as an empty string.
  const log = createLogger({ service: "duke-agent" }).child({
    room: ctx.job.room?.name ?? ctx.room.name,
  });

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
  // The job message carries the room's name, and it has to be read from there. `ctx.room` is a
  // bare Room at this point — its `name` is filled in by the server once `ctx.connect()` runs
  // further down — so reading it here gives an empty string, `sessionIdFromRoom` says "not ours",
  // and a perfectly good call gets refused as if a stranger had dialled in.
  const roomName = ctx.job.room?.name ?? ctx.room.name ?? "";
  const sessionId = sessionIdFromRoom(roomName);
  if (sessionId === null) {
    log.error({ roomName, jobId: ctx.job.id }, "room is not a Duke room; refusing the job");
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

  // One model, one place to change it: `GROQ_MODEL` in `.env`, falling back to the shared
  // default. `reasoningEffort` is not a taste setting — a reasoning model at its default effort
  // spends the reply's token budget on thinking and the learner hears a truncated sentence or
  // nothing at all (verified against the live API; see `groqReasoningEffort`). It is `undefined`
  // for a model that does not take the parameter, and the plugin does not send an undefined one,
  // so switching models cannot turn this into a 400.
  const groqModel = optionalEnv("GROQ_MODEL", DEFAULT_GROQ_MODEL);
  const groqOptions: GroqOptions = {
    apiKey: requireEnv("GROQ_API_KEY"),
    model: groqModel,
    reasoningEffort: groqReasoningEffort(groqModel),
  };

  const llm = LLM.withGroq(groqOptions);

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

  // An open room spends minutes whether or not anyone is talking, and the learner's month is
  // small. This is what gives up on their behalf: once the character has stopped and is waiting
  // for an answer, the countdown runs, and anyone speaking resets it. `CALL_IDLE_SECONDS` sets
  // the wait (`0` turns it off); a typo there cannot turn into an instant hang-up — see
  // `idleSecondsFrom`.
  const idleSeconds = idleSecondsFrom(
    optionalEnv("CALL_IDLE_SECONDS", String(DEFAULT_CALL_IDLE_SECONDS)),
  );

  const idle = new IdleWatch(idleSeconds, {
    onIdle: () => {
      log.info({ sessionId, idleSeconds }, "nobody answered; saying goodbye and hanging up");

      // Not awaited: this runs inside a timer callback, and the call must not be kept open by the
      // goodbye itself. `ctx.shutdown` is the part that actually hangs up — closing the session
      // alone leaves the agent sitting in the room, so the phone would hear the goodbye and then
      // keep spending minutes on a line nobody is on. Shutting the job down runs the callbacks
      // below (which flush the transcript) and leaves the room, which is what the call screen
      // sees as the friend hanging up.
      void (async () => {
        try {
          await session.generateReply({ instructions: IDLE_GOODBYE_INSTRUCTION }).waitForPlayout();
        } catch (error) {
          // The line is a courtesy. Hanging up still has to happen if the model refuses to speak.
          log.warn({ err: serializeError(error) }, "the goodbye line could not be said");
        }

        ctx.shutdown("idle");
      })();
    },
  });

  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    // "listening" is the character finished and waiting. Anything else means it is still
    // thinking or talking, and a countdown then would be counting the character's own turn.
    if (event.newState === "listening") idle.arm();
    else idle.cancel();
  });

  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    if (event.newState === "speaking") idle.cancel();
  });

  ctx.addShutdownCallback(async (): Promise<void> => {
    log.info({ sessionId }, "call ended");
    idle.cancel();
    await session.close();
    await recorder.flush();
    await adapters.close();
  });

  await session.start({
    agent: new DukeAgent(brief, azureTts, (reason) =>
      log.warn(
        { sessionId, character: brief.characterName, reason },
        "the savage guard rewrote a sentence",
      ),
    ),
    room: ctx.room,
  });

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
    // Named explicitly, from the same constant the API dispatches with. The SDK would otherwise
    // read `LIVEKIT_AGENT_NAME` itself and fall back to an **empty** name, and an unnamed worker
    // that is dispatched by name is never sent to the room: the call connects and nobody answers,
    // with no error on either side. See DEFAULT_AGENT_NAME in @duke/adapters.
    agentName: optionalEnv("LIVEKIT_AGENT_NAME", DEFAULT_AGENT_NAME),
    // The framework starts a small HTTP server for its own bookkeeping (load reports, the
    // in-flight job list). It binds **every interface** by default, which on this machine means
    // the home Wi-Fi can reach it — and opened for no reason at all, since LiveKit Cloud talks to
    // this process over an *outbound* WebSocket and never dials in. Pinned to loopback: the port
    // stays useful locally and stops being a way in from outside.
    host: "127.0.0.1",
  }),
);
