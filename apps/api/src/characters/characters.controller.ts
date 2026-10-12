import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { Character, RememberedCard } from "@duke/core";
import { DeviceUserGuard } from "../common/device-user.guard";
import { UserId } from "../common/http";
import { CharactersService } from "./characters.service";

@Controller("characters")
@UseGuards(DeviceUserGuard)
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Get()
  list(@UserId() userId: string): Promise<Character[]> {
    return this.characters.list(userId);
  }

  @Post()
  create(@UserId() userId: string, @Body() body: unknown): Promise<Character> {
    return this.characters.create(userId, body);
  }

  @Get(":id")
  get(@UserId() userId: string, @Param("id") id: string): Promise<Character> {
    return this.characters.get(userId, id);
  }

  @Patch(":id")
  update(
    @UserId() userId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Character> {
    return this.characters.update(userId, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param("id") id: string): Promise<void> {
    await this.characters.remove(userId, id);
  }

  /** Used by the call screen to show "last time we talked about…". */
  @Get(":id/remember")
  remember(@UserId() userId: string, @Param("id") id: string): Promise<RememberedCard> {
    return this.characters.remember(userId, id);
  }
}
