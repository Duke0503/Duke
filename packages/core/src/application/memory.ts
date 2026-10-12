/**
 * Verb: what the character remembers about you.
 *
 * "Continue an old call" must not reload a transcript — that would cost tokens on every
 * single call and would slowly bury the personality under old logs. Instead we rebuild a
 * tiny card from the *last* finished call: its topic, its one-line summary, the few
 * mistakes, and the few new words.
 *
 * The card is assembled from the corrections and vocabulary tables rather than from a
 * stored blob, so editing or deleting a correction immediately changes what is remembered.
 */

import type { Character } from "../domain/character";
import { type MemoryCard, emptyMemoryCard } from "../domain/memory-card";
import type { SessionRepository } from "./ports";

export interface MemoryDeps {
  readonly sessions: SessionRepository;
}

export interface RememberedCard {
  readonly card: MemoryCard;
  /** The session the card came from, so the UI can say "from our last call". */
  readonly fromSessionId: string | null;
  readonly fromSessionStartedAt: Date | null;
}

export async function rememberLastCall(
  deps: MemoryDeps,
  character: Character,
): Promise<RememberedCard> {
  const latest = await deps.sessions.latestForCharacter(character.id);
  if (latest === null) {
    return {
      card: emptyMemoryCard(character.name),
      fromSessionId: null,
      fromSessionStartedAt: null,
    };
  }

  const [corrections, vocabulary] = await Promise.all([
    deps.sessions.listCorrections(latest.id),
    deps.sessions.listVocabulary(latest.id),
  ]);

  return {
    card: {
      characterName: character.name,
      topic: latest.topic,
      summary: latest.summary,
      // `renderMemoryCard` applies the real limits; this is the readable source form.
      mistakes: corrections.map((item) => `${item.said} → ${item.fixed}`),
      newWords: vocabulary.map((item) => item.word),
    },
    fromSessionId: latest.id,
    fromSessionStartedAt: latest.startedAt,
  };
}
