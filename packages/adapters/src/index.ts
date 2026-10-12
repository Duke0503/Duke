/**
 * Real implementations of the ports defined in `@duke/core`.
 *
 * The only thing to know: {@link createAdapters} hands back **lazy** services. Nothing
 * connects to Postgres, Redis, Deepgram, Groq, Azure or LiveKit until the first method call
 * on the service that needs it. That is what lets the API boot, serve `/api/health` and
 * `/api/ready`, and tell you exactly which key is still missing — instead of dying at
 * startup with a stack trace.
 */

import type {
  Brain,
  Cache,
  CharacterRepository,
  Clock,
  SessionRepository,
  SpeechToText,
  Transport,
  Voice,
} from "@duke/core";
import { requireEnv } from "@duke/shared";
import { AzureVoice } from "./azure/azure-voice";
import { SystemClock } from "./clock/system-clock";
import { DeepgramStt } from "./deepgram/deepgram-stt";
import { DrizzleCharacterRepository } from "./drizzle/character-repository";
import { createDatabase, type Database } from "./drizzle/client";
import { DrizzleSessionRepository } from "./drizzle/session-repository";
import { GroqBrain } from "./groq/groq-brain";
import { lazyProxy } from "./internal/lazy-proxy";
import { LiveKitTransport } from "./livekit/livekit-transport";
import { createRedisCache, type RedisCache } from "./redis/redis-cache";

export * from "./internal/async-queue";
export * from "./internal/ids";
export * from "./internal/lazy-proxy";
export * from "./clock/system-clock";
export * from "./redis/redis-cache";
export * from "./drizzle/schema";
export * from "./drizzle/client";
export * from "./drizzle/character-repository";
export * from "./drizzle/session-repository";
export * from "./deepgram/deepgram-stt";
export * from "./groq/groq-brain";
export * from "./azure/azure-voice";
export * from "./livekit/livekit-transport";

/** Every port, wired to a real provider. */
export interface Adapters {
  readonly characters: CharacterRepository;
  readonly sessions: SessionRepository;
  readonly cache: Cache;
  readonly clock: Clock;
  readonly stt: SpeechToText;
  readonly brain: Brain;
  readonly voice: Voice;
  readonly transport: Transport;
  /** Closes the connections that were actually opened. Safe to call twice. */
  close(): Promise<void>;
}

export interface CreateAdaptersOptions {
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  /**
   * Where non-fatal provider complaints go. A rejected emotion style and a dead Redis both
   * land here: worth a log line, never worth dropping the call.
   */
  readonly onError?: (error: unknown) => void;
}

export function createAdapters(options: CreateAdaptersOptions = {}): Adapters {
  const onError = options.onError ?? ((): void => {});
  let database: Database | null = null;
  let cache: RedisCache | null = null;

  const db = (): Database =>
    (database ??= createDatabase(options.databaseUrl ?? requireEnv("DATABASE_URL")));

  const redis = (): RedisCache =>
    (cache ??= createRedisCache(options.redisUrl ?? requireEnv("REDIS_URL"), { onError }));

  return {
    characters: lazyProxy(() => new DrizzleCharacterRepository(db().db)),
    sessions: lazyProxy(() => new DrizzleSessionRepository(db().db)),
    cache: lazyProxy(() => redis()),
    // No keys, no I/O. There is nothing to defer.
    clock: new SystemClock(),
    stt: lazyProxy(() => new DeepgramStt({ onError })),
    brain: lazyProxy(() => new GroqBrain({ onError })),
    voice: lazyProxy(() => new AzureVoice({ onError })),
    transport: lazyProxy(() => new LiveKitTransport({ onError })),
    close: async (): Promise<void> => {
      await database?.close();
      await cache?.close();
      database = null;
      cache = null;
    },
  };
}
