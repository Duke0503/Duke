/**
 * Reading back old calls: the History list and the Session Detail page.
 *
 * This is the only part of Duke that is read-only, which makes it the easiest place to get
 * ownership wrong. Two rules are enforced here and nowhere else:
 *
 *   1. every query is filtered by the caller's user id (the repositories take it, so it is not
 *      something you can forget to add at the last line),
 *   2. the character's name is resolved for the list, because a History row that says
 *      "session 4f2a…" is useless to a human.
 *
 * Nothing is summarised or re-derived here. What the summariser wrote at the end of the call is
 * what is shown; if it wrote nothing, the screen shows what it has.
 */

import { Inject, Injectable } from "@nestjs/common";
import type {
  Character,
  CharacterRepository,
  Correction,
  Session,
  SessionRepository,
  Speaker,
  VocabularyItem,
} from "@duke/core";
import { notFound } from "../common/http";
import { CHARACTER_REPOSITORY, SESSION_REPOSITORY } from "../platform/tokens";

/** One row on the History screen. */
export interface SessionListItemView {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSec: number;
  readonly topic: string | null;
  readonly summary: string | null;
  readonly mood: string | null;
  /** True while the call is still open — History shows those at the top. */
  readonly open: boolean;
}

export interface SessionTurnView {
  readonly id: string;
  readonly index: number;
  readonly speaker: Speaker;
  readonly text: string;
  readonly at: string;
}

/** Just enough of the friend to head the Session Detail page. */
export interface SessionFriendView {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly avatarUrl: string | null;
}

export interface SessionDetailView {
  readonly session: SessionListItemView;
  /** Null only if the database lost the friend. The transcript is still yours. */
  readonly character: SessionFriendView | null;
  readonly turns: readonly SessionTurnView[];
  readonly corrections: readonly Correction[];
  readonly vocabulary: readonly VocabularyItem[];
}

/** Newest first, and never so many that one request drags the whole table back. */
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 200;

const toFriend = (character: Character | null): SessionFriendView | null =>
  character === null
    ? null
    : {
        id: character.id,
        name: character.name,
        role: character.role,
        avatarUrl: character.avatarUrl,
      };

const toListItem = (session: Session, character: Character | null): SessionListItemView => ({
  id: session.id,
  characterId: session.characterId,
  characterName: character?.name ?? "Your friend",
  startedAt: session.startedAt.toISOString(),
  endedAt: session.endedAt?.toISOString() ?? null,
  durationSec: session.durationSec,
  topic: session.topic,
  summary: session.summary,
  mood: session.mood,
  open: session.endedAt === null,
});

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
  ) {}

  /**
   * The History list.
   *
   * The names come from one extra query rather than a join, because `CharacterRepository` is a
   * port and this is exactly the kind of decision that would otherwise leak a join into core.
   */
  async list(userId: string, limit?: number): Promise<SessionListItemView[]> {
    const [sessions, characters] = await Promise.all([
      this.sessions.listByUser(userId, clampLimit(limit)),
      this.characters.listByUser(userId),
    ]);

    const byId = new Map(characters.map((character) => [character.id, character]));
    return sessions.map((session) => toListItem(session, byId.get(session.characterId) ?? null));
  }

  /** One call, with its transcript, corrections and new words. */
  async detail(userId: string, id: string): Promise<SessionDetailView> {
    const session = await this.sessions.getById(id);
    if (session === null || session.userId !== userId) {
      throw notFound("id", "No such call.");
    }

    const character = await this.characters.getById(session.characterId);
    const [turns, corrections, vocabulary] = await Promise.all([
      this.sessions.listTurns(session.id),
      this.sessions.listCorrections(session.id),
      this.sessions.listVocabulary(session.id),
    ]);

    return {
      session: toListItem(session, character),
      character: toFriend(character),
      turns: turns.map((turn) => ({
        id: turn.id,
        index: turn.index,
        speaker: turn.speaker,
        text: turn.text,
        at: turn.createdAt.toISOString(),
      })),
      corrections,
      vocabulary,
    };
  }
}

function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.trunc(limit)));
}
