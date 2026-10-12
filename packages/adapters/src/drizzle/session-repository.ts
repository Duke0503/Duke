/**
 * Postgres-backed `SessionRepository`.
 *
 * `appendTurn` is called on every sentence of every call, so it is a single insert and
 * nothing more — no read-modify-write, no transaction, no lookup of the parent row.
 */

import {
  isMood,
  type CharacterId,
  type Correction,
  type CorrectionId,
  type Mood,
  type Session,
  type SessionId,
  type SessionRepository,
  type Speaker,
  type Turn,
  type TurnId,
  type UserId,
  type VocabularyItem,
  type VocabularyId,
} from "@duke/core";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { DrizzleDb } from "./client";
import { corrections, sessions, turns, vocabulary } from "./schema";

type SessionRow = typeof sessions.$inferSelect;
type TurnRow = typeof turns.$inferSelect;
type CorrectionRow = typeof corrections.$inferSelect;
type VocabularyRow = typeof vocabulary.$inferSelect;

const toMood = (value: string | null): Mood | null =>
  value !== null && isMood(value) ? value : null;

const toSpeaker = (value: string): Speaker => (value === "character" ? "character" : "user");

const toSession = (row: SessionRow): Session => ({
  id: row.id as SessionId,
  userId: row.userId as UserId,
  characterId: row.characterId as CharacterId,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  durationSec: row.durationSec,
  topic: row.topic,
  summary: row.summary,
  mood: toMood(row.mood),
});

const toTurn = (row: TurnRow): Turn => ({
  id: row.id as TurnId,
  sessionId: row.sessionId as SessionId,
  index: row.idx,
  speaker: toSpeaker(row.speaker),
  text: row.text,
  createdAt: row.createdAt,
});

const toCorrection = (row: CorrectionRow): Correction => ({
  id: row.id as CorrectionId,
  sessionId: row.sessionId as SessionId,
  turnId: row.turnId as TurnId | null,
  said: row.said,
  fixed: row.fixed,
  note: row.note,
});

const toVocabulary = (row: VocabularyRow): VocabularyItem => ({
  id: row.id as VocabularyId,
  sessionId: row.sessionId as SessionId,
  word: row.word,
  meaning: row.meaning,
});

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: DrizzleDb) {}

  async listByUser(userId: string, limit = 50): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.startedAt))
      .limit(limit);
    return rows.map(toSession);
  }

  async getById(id: string): Promise<Session | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toSession(row);
  }

  async save(session: Session): Promise<void> {
    const row = {
      id: session.id,
      userId: session.userId,
      characterId: session.characterId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSec: session.durationSec,
      topic: session.topic,
      summary: session.summary,
      mood: session.mood,
    };
    await this.db
      .insert(sessions)
      .values(row)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          endedAt: row.endedAt,
          durationSec: row.durationSec,
          topic: row.topic,
          summary: row.summary,
          mood: row.mood,
        },
      });
  }

  async appendTurn(turn: Turn): Promise<void> {
    await this.db
      .insert(turns)
      .values({
        id: turn.id,
        sessionId: turn.sessionId,
        idx: turn.index,
        speaker: turn.speaker,
        text: turn.text,
        createdAt: turn.createdAt,
      })
      // A retried request must not duplicate the line.
      .onConflictDoNothing({ target: turns.id });
  }

  async saveCorrections(items: readonly Correction[]): Promise<void> {
    if (items.length === 0) return;
    await this.db
      .insert(corrections)
      .values(
        items.map((item) => ({
          id: item.id,
          sessionId: item.sessionId,
          turnId: item.turnId,
          said: item.said,
          fixed: item.fixed,
          note: item.note,
        })),
      )
      .onConflictDoNothing({ target: corrections.id });
  }

  async saveVocabulary(items: readonly VocabularyItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.db
      .insert(vocabulary)
      .values(
        items.map((item) => ({
          id: item.id,
          sessionId: item.sessionId,
          word: item.word,
          meaning: item.meaning,
        })),
      )
      .onConflictDoNothing({ target: vocabulary.id });
  }

  async listTurns(sessionId: string): Promise<Turn[]> {
    const rows = await this.db
      .select()
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(asc(turns.idx));
    return rows.map(toTurn);
  }

  async listCorrections(sessionId: string): Promise<Correction[]> {
    const rows = await this.db
      .select()
      .from(corrections)
      .where(eq(corrections.sessionId, sessionId));
    return rows.map(toCorrection);
  }

  async listVocabulary(sessionId: string): Promise<VocabularyItem[]> {
    const rows = await this.db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.sessionId, sessionId));
    return rows.map(toVocabulary);
  }

  async latestForCharacter(characterId: string): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.characterId, characterId), isNotNull(sessions.endedAt)))
      .orderBy(desc(sessions.startedAt))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toSession(row);
  }
}
