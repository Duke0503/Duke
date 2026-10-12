/**
 * Where the ports become real.
 *
 * `createAdapters()` is called once, at bootstrap, and it is cheap and lazy: it opens no
 * sockets and reads no keys. Each provider below just hands out one of its fields. That is
 * deliberate — the API must be able to start with an empty `.env` so it can answer
 * `/api/ready` and tell you which key is still missing, instead of dying with a stack trace.
 *
 * A failure to reach a provider shows up at the first request that needs it, as the friendly
 * `ENV_MISSING` error naming the key.
 */

import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createAdapters, type Adapters } from "@duke/adapters";
import { serializeError } from "@duke/shared";
import { logger } from "../observability/logger";
import {
  ADAPTERS,
  BRAIN,
  CACHE,
  CHARACTER_REPOSITORY,
  CLOCK,
  SESSION_REPOSITORY,
  SPEECH_TO_TEXT,
  TRANSPORT,
  USER_REPOSITORY,
  VOICE,
} from "./tokens";

/** Providers that plug one port into one adapter field. */
const bind = (token: symbol, field: keyof Adapters) => ({
  provide: token,
  useFactory: (adapters: Adapters) => adapters[field],
  inject: [ADAPTERS],
});

@Global()
@Module({
  providers: [
    {
      provide: ADAPTERS,
      useFactory: (): Adapters =>
        createAdapters({
          // A rejected emotion style, a dead Redis, a room that already exists: worth a log
          // line, never worth dropping a call.
          onError: (error: unknown) => logger.warn({ err: serializeError(error) }, "adapter warning"),
        }),
    },
    bind(USER_REPOSITORY, "users"),
    bind(CHARACTER_REPOSITORY, "characters"),
    bind(SESSION_REPOSITORY, "sessions"),
    bind(CACHE, "cache"),
    bind(CLOCK, "clock"),
    bind(SPEECH_TO_TEXT, "stt"),
    bind(BRAIN, "brain"),
    bind(VOICE, "voice"),
    bind(TRANSPORT, "transport"),
  ],
  exports: [
    ADAPTERS,
    USER_REPOSITORY,
    CHARACTER_REPOSITORY,
    SESSION_REPOSITORY,
    CACHE,
    CLOCK,
    SPEECH_TO_TEXT,
    BRAIN,
    VOICE,
    TRANSPORT,
  ],
})
export class PlatformModule implements OnApplicationShutdown {
  constructor(@Inject(ADAPTERS) private readonly adapters: Adapters) {}

  /** Close the connections that were actually opened. `close()` is safe to call twice. */
  async onApplicationShutdown(): Promise<void> {
    await this.adapters.close();
  }
}
