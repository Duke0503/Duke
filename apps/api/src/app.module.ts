/**
 * The whole API, assembled.
 *
 * Two groups of modules, and the split matters:
 *
 *   - `PlatformModule` is the only one that knows about providers (Postgres, Redis, Groq,
 *     Deepgram, Azure, LiveKit). It is `@Global()`, so every feature module below can inject a
 *     port without importing anything, and there is exactly one place to look when a key is
 *     wrong.
 *   - the feature modules are one folder each (`characters`, `sessions`, `calls`, `usage`,
 *     `setup`), and each one is a controller plus the use-case call for that screen.
 *
 * Feature modules never import each other, except where a real dependency exists: ending a call
 * counts its length, so `CallsModule` imports `UsageModule`.
 *
 * `SessionGuard` is registered here as a global guard rather than on each controller, so being
 * reachable is opt-in (`@Public()`) and being protected is the default. The two public routes
 * are the health probe and the login.
 */

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { SessionGuard } from "./common/session.guard";
import { CallsModule } from "./calls/calls.module";
import { CharactersModule } from "./characters/characters.module";
import { PlatformModule } from "./platform/platform.module";
import { SessionsModule } from "./sessions/sessions.module";
import { SetupModule } from "./setup/setup.module";
import { UsageModule } from "./usage/usage.module";

@Module({
  imports: [
    PlatformModule,
    AuthModule,
    SetupModule,
    CharactersModule,
    SessionsModule,
    UsageModule,
    CallsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
