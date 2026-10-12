/**
 * The character screens' backend.
 *
 * Thin on purpose: everything interesting — what counts as a valid friend, how the voice is
 * chosen, what counts as savage — is a core rule. This file just proves the caller owns the
 * row, calls the rule, and stores the result.
 *
 * The ownership check is the one thing that MUST live here, because it is a fact about the
 * request, not about the domain.
 */

import { Inject, Injectable } from "@nestjs/common";
import {
  createCharacter,
  rememberLastCall,
  updateCharacter,
  type Character,
  type CharacterRepository,
  type Clock,
  type RememberedCard,
  type SessionRepository,
} from "@duke/core";
import { newId } from "@duke/adapters";
import { invalidInput, notFound, parseBody } from "../common/http";
import { CHARACTER_REPOSITORY, CLOCK, SESSION_REPOSITORY } from "../platform/tokens";
import { characterDraftSchema, notFoundProblem } from "./characters.dto";

@Injectable()
export class CharactersService {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(userId: string): Promise<Character[]> {
    return this.characters.listByUser(userId);
  }

  /** Fetch, or fail. Never returns a character that belongs to another device. */
  async get(userId: string, id: string): Promise<Character> {
    const character = await this.characters.getById(id);
    if (character === null || character.userId !== userId) {
      throw notFound(notFoundProblem().field, notFoundProblem().problem);
    }
    return character;
  }

  async create(userId: string, body: unknown): Promise<Character> {
    const draft = parseBody(characterDraftSchema, body);
    const result = createCharacter(userId, draft, { clock: this.clock, newId });
    if (!result.ok) throw invalidInput(result.problems);
    await this.characters.save(result.value);
    return result.value;
  }

  async update(userId: string, id: string, body: unknown): Promise<Character> {
    const existing = await this.get(userId, id);
    const draft = parseBody(characterDraftSchema, body);
    const result = updateCharacter(existing, draft, { clock: this.clock, newId });
    if (!result.ok) throw invalidInput(result.problems);
    await this.characters.save(result.value);
    return result.value;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.characters.remove(id);
  }

  /** What this friend remembers about you, for the "Continue" card on the call screen. */
  async remember(userId: string, id: string): Promise<RememberedCard> {
    const character = await this.get(userId, id);
    return rememberLastCall({ sessions: this.sessions }, character);
  }
}
