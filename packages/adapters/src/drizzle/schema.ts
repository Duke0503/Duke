/**
 * The 8 tables. One file, so "what Duke stores" is readable in one screen.
 *
 * Deliberately NOT here yet: `memories.embedding vector(1536)`. The column needs the
 * pgvector extension enabled, and long-term semantic memory is on the "do not build yet"
 * list. The `memories` table itself exists so the shape is settled.
 */

import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** No real login yet: the browser's anonymous device id. */
  deviceId: text("device_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    personality: text("personality").notNull().default(""),
    voiceId: text("voice_id").notNull(),
    accent: text("accent").notNull().default(""),
    feedbackStyle: text("feedback_style").notNull().default("quiet-tips"),
    savage: boolean("savage").notNull().default(false),
    avatarUrl: text("avatar_url"),
    defaultTopic: text("default_topic"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("characters_user_idx").on(table.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    roomName: text("room_name"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec").notNull().default(0),
    topic: text("topic"),
    summary: text("summary"),
    mood: text("mood"),
  },
  (table) => [index("sessions_user_idx").on(table.userId, table.startedAt)],
);

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    speaker: text("speaker").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("turns_session_idx").on(table.sessionId, table.idx)],
);

export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id"),
    said: text("said").notNull(),
    fixed: text("fixed").notNull(),
    note: text("note"),
  },
  (table) => [index("corrections_session_idx").on(table.sessionId)],
);

export const vocabulary = pgTable(
  "vocabulary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    word: text("word").notNull(),
    meaning: text("meaning").notNull().default(""),
  },
  (table) => [index("vocabulary_session_idx").on(table.sessionId)],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id"),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memories_character_idx").on(table.characterId)],
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `YYYY-MM`, so a month is one row per user. */
    month: text("month").notNull(),
    sttSec: integer("stt_sec").notNull().default(0),
    ttsChars: integer("tts_chars").notNull().default(0),
    llmTokens: integer("llm_tokens").notNull().default(0),
  },
  (table) => [index("usage_user_month_idx").on(table.userId, table.month)],
);

export const schema = {
  users,
  characters,
  sessions,
  turns,
  corrections,
  vocabulary,
  memories,
  usageLedger,
};
