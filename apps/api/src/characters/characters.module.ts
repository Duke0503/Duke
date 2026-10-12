import { Module } from "@nestjs/common";
import { DeviceUserGuard } from "../common/device-user.guard";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./characters.service";

@Module({
  controllers: [CharactersController],
  providers: [CharactersService, DeviceUserGuard],
})
export class CharactersModule {}
