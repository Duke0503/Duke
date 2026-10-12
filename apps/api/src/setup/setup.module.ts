import { Module } from "@nestjs/common";
import { SetupController } from "./setup.controller";

/**
 * Nothing to inject: these routes read the environment directly, which is the point.
 * They must answer while every provider key is still empty.
 */
@Module({
  controllers: [SetupController],
})
export class SetupModule {}
