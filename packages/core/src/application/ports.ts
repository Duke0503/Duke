/**
 * The ports. `core` talks to the outside world only through these interfaces.
 * Real implementations live in `@duke/adapters` and are injected by NestJS.
 */

import type { Character } from "../domain/character";
import type { Correction } from "../domain/correction";
import type { Mood } from "../domain/mood";
import type { Session, Turn } from "../domain/session";
import type { VocabularyItem } from "../domain/vocabulary";

// ---------------------------------------------------------------- storage

/**
 * Who the request belongs to.
 *
 * There is no login yet. The browser makes one anonymous id, keeps it in local storage, and
 * sends it as `x-device-id`; this turns that into a real user row on first sight. That is
 * enough to keep one person's friends and history together, and it means there is no
 * password to leak. When real accounts arrive, this is the function that gains a second
 * argument.
 */
export interface UserRepository {
  findOrCreateByDevice(deviceId: string): Promise<{ readonly id: string }>;
}

export interface CharacterRepository {
  listByUser(userId: string): Promise<Character[]>;
  getById(id: string): Promise<Character | null>;
  save(character: Character): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SessionRepository {
  listByUser(userId: string, limit?: number): Promise<Session[]>;
  getById(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  appendTurn(turn: Turn): Promise<void>;
  saveCorrections(items: readonly Correction[]): Promise<void>;
  saveVocabulary(items: readonly VocabularyItem[]): Promise<void>;
  /** The transcript, for the Session Detail screen and the summariser. */
  listTurns(sessionId: string): Promise<Turn[]>;
  listCorrections(sessionId: string): Promise<Correction[]>;
  listVocabulary(sessionId: string): Promise<VocabularyItem[]>;
  /** The most recent finished session with this character, for "Continue". */
  latestForCharacter(characterId: string): Promise<Session | null>;
}

/** Fast, temporary storage (Redis). */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Adds a value and returns the new total. Used for rate limits and usage. */
  increment(key: string, by?: number, ttlSeconds?: number): Promise<number>;
}

export interface Clock {
  now(): Date;
}

// ---------------------------------------------------------------- the voice loop

export interface AudioChunk {
  readonly pcm: Uint8Array;
  readonly sampleRate: number;
}

export interface TranscriptEvent {
  readonly text: string;
  readonly isFinal: boolean;
}

/** Ears. */
export interface SpeechToText {
  transcribe(
    audio: AsyncIterable<AudioChunk>,
    options: { readonly language: string },
  ): AsyncIterable<TranscriptEvent>;
}

export interface BrainInput {
  /** Character + memory card + feedback style, fully rendered. */
  readonly system: string;
  readonly history: ReadonlyArray<{ readonly speaker: "user" | "character"; readonly text: string }>;
  readonly userText: string;
}

export interface BrainChunk {
  readonly text: string;
  readonly done: boolean;
}

/** Brain. Streams the reply; the first token carries the [[mood]] tag. */
export interface Brain {
  reply(input: BrainInput): AsyncIterable<BrainChunk>;
}

export interface SpeakInput {
  readonly text: string;
  readonly voiceId: string;
  readonly mood: Mood | null;
}

/** Voice. Streams synthesized audio for one utterance. */
export interface Voice {
  speak(input: SpeakInput): AsyncIterable<AudioChunk>;
}

/** The phone line. */
export interface Transport {
  createRoom(
    roomId: string,
    identity: string,
  ): Promise<{ readonly token: string; readonly url: string }>;
}
