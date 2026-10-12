/**
 * The "what happened in that call" note.
 *
 * One cheap extra LLM call returns JSON. This module is the *only* place that JSON is
 * trusted — everything downstream (MemoryCard, corrections, vocabulary) comes from the
 * parsed and clamped result, so a badly behaved model cannot inject a giant blob into the
 * next prompt.
 */

import type { Correction } from "./correction";
import { type CorrectionId, type NewId, type SessionId, type VocabularyId } from "./ids";
import { type MemoryCard, MEMORY_LIMITS } from "./memory-card";
import type { VocabularyItem } from "./vocabulary";

export interface SessionSummary {
  readonly topic: string;
  readonly summary: string;
  /** `"what I said → what is better"` strings. */
  readonly mistakes: readonly string[];
  readonly newWords: readonly string[];
}

export const EMPTY_SUMMARY: SessionSummary = {
  topic: "",
  summary: "",
  mistakes: [],
  newWords: [],
};

/** Hard caps, so one weird reply cannot blow up the next prompt. */
export const SUMMARY_LIMITS = {
  topicChars: 80,
  summaryChars: 400,
  mistakes: 10,
  newWords: 12,
} as const;

const clampText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const clampList = (value: unknown, max: number, maxChars: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxChars))
    .filter((item) => item.length > 0)
    .slice(0, max);
};

/**
 * Models wrap JSON in ``` fences, add a friendly sentence before it, or forget a closing
 * brace. Take the outermost braces we can find and parse that.
 */
export function parseSessionSummary(raw: string): SessionSummary | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  return {
    topic: clampText(record["topic"], SUMMARY_LIMITS.topicChars),
    summary: clampText(record["summary"], SUMMARY_LIMITS.summaryChars),
    mistakes: clampList(record["mistakes"], SUMMARY_LIMITS.mistakes, 120),
    newWords: clampList(record["newWords"], SUMMARY_LIMITS.newWords, 40),
  };
}

export function isEmptySummary(summary: SessionSummary): boolean {
  return (
    summary.topic.length === 0 &&
    summary.summary.length === 0 &&
    summary.mistakes.length === 0 &&
    summary.newWords.length === 0
  );
}

/** The tiny note that goes into the next call's prompt. Never the whole transcript. */
export function toMemoryCard(characterName: string, summary: SessionSummary): MemoryCard {
  return {
    characterName,
    topic: summary.topic.length > 0 ? summary.topic : null,
    summary: summary.summary.length > 0 ? summary.summary : null,
    mistakes: summary.mistakes.slice(0, MEMORY_LIMITS.mistakes),
    newWords: summary.newWords.slice(0, MEMORY_LIMITS.newWords),
  };
}

/** Arrows the summarizer is told to use: `I finish → I finished`. */
const ARROW = /\s*(?:→|->|=>)\s*/;

export interface ParsedCorrection {
  readonly said: string;
  readonly fixed: string;
}

/** Split `"said → fixed"`. Returns null when there is no arrow to split on. */
export function splitCorrection(text: string): ParsedCorrection | null {
  const parts = text.split(ARROW);
  if (parts.length < 2) return null;
  const said = (parts[0] ?? "").trim();
  const fixed = (parts.slice(1).join(" ").trim());
  if (said.length === 0 || fixed.length === 0) return null;
  return { said, fixed };
}

export function toCorrections(
  sessionId: SessionId,
  summary: SessionSummary,
  newId: NewId,
): Correction[] {
  const items: Correction[] = [];
  for (const mistake of summary.mistakes) {
    const split = splitCorrection(mistake);
    if (split === null) continue;
    items.push({
      id: newId() as CorrectionId,
      sessionId,
      turnId: null,
      said: split.said,
      fixed: split.fixed,
      note: null,
    });
  }
  return items;
}

export function toVocabulary(
  sessionId: SessionId,
  summary: SessionSummary,
  newId: NewId,
): VocabularyItem[] {
  return summary.newWords.map((word) => ({
    id: newId() as VocabularyId,
    sessionId,
    word,
    meaning: "",
  }));
}
