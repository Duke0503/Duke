/**
 * Postgres-backed `CharacterRepository`.
 *
 * The only interesting decision here is the mapping layer: rows come back with loose
 * `string` columns, the domain insists on `FeedbackStyle` and `Mood`. Every conversion
 * goes through a guard in `@duke/core`, so a hand-edited row degrades to the default
 * instead of crashing a call.
 */

import {
  isFeedbackStyle,
  type Character,
  type CharacterId,
  type CharacterRepository,
  type FeedbackStyle,
  type UserId,
} from "@duke/core";
import { desc, eq } from "drizzle-orm";
import type { DrizzleDb } from "./client";
import { characters } from "./schema";

type CharacterRow = typeof characters.$inferSelect;

const DEFAULT_FEEDBACK_STYLE: FeedbackStyle = "quiet-tips";

const toFeedbackStyle = (value: string): FeedbackStyle =>
  isFeedbackStyle(value) ? value : DEFAULT_FEEDBACK_STYLE;

export const toCharacter = (row: CharacterRow): Character => ({
  id: row.id as CharacterId,
  userId: row.userId as UserId,
  name: row.name,
  role: row.role,
  personality: row.personality,
  voiceId: row.voiceId,
  accent: row.accent,
  feedbackStyle: toFeedbackStyle(row.feedbackStyle),
  savage: row.savage,
  avatarUrl: row.avatarUrl,
  defaultTopic: row.defaultTopic,
  createdAt: row.createdAt,
});

/** Row shape for an insert/update, without the id (the database makes that). */
const toRow = (character: Character) => ({
  id: character.id,
  userId: character.userId,
  name: character.name,
  role: character.role,
  personality: character.personality,
  voiceId: character.voiceId,
  accent: character.accent,
  feedbackStyle: character.feedbackStyle,
  savage: character.savage,
  avatarUrl: character.avatarUrl,
  defaultTopic: character.defaultTopic,
  createdAt: character.createdAt,
});

export class DrizzleCharacterRepository implements CharacterRepository {
  constructor(private readonly db: DrizzleDb) {}

  async listByUser(userId: string): Promise<Character[]> {
    const rows = await this.db
      .select()
      .from(characters)
      .where(eq(characters.userId, userId))
      .orderBy(desc(characters.createdAt));
    return rows.map(toCharacter);
  }

  async getById(id: string): Promise<Character | null> {
    const rows = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toCharacter(row);
  }

  async save(character: Character): Promise<void> {
    const row = toRow(character);
    await this.db
      .insert(characters)
      .values(row)
      .onConflictDoUpdate({
        target: characters.id,
        set: {
          name: row.name,
          role: row.role,
          personality: row.personality,
          voiceId: row.voiceId,
          accent: row.accent,
          feedbackStyle: row.feedbackStyle,
          savage: row.savage,
          avatarUrl: row.avatarUrl,
          defaultTopic: row.defaultTopic,
        },
      });
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(characters).where(eq(characters.id, id));
  }
}
