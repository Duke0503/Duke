import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";

/**
 * Modules to add in later milestones:
 *   characters  sessions  calls  usage  auth
 *
 * Each binds its ports (@duke/core) to adapters (@duke/adapters) with DI:
 *   { provide: CHARACTER_REPOSITORY, useClass: DrizzleCharacterRepository }
 */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
