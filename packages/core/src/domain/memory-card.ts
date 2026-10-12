/**
 * The small note loaded into the prompt when the user taps "Continue"
 * on an old session. Deliberately tiny — we never reload a whole transcript.
 */

export interface MemoryCard {
  readonly characterName: string;
  readonly topic: string | null;
  readonly summary: string | null;
  readonly mistakes: readonly string[];
  readonly newWords: readonly string[];
}

export const MEMORY_LIMITS = {
  mistakes: 5,
  newWords: 8,
} as const;

export function emptyMemoryCard(characterName: string): MemoryCard {
  return {
    characterName,
    topic: null,
    summary: null,
    mistakes: [],
    newWords: [],
  };
}

export function isEmptyMemoryCard(card: MemoryCard): boolean {
  return (
    card.topic === null &&
    card.summary === null &&
    card.mistakes.length === 0 &&
    card.newWords.length === 0
  );
}

/** Compact text block appended to the system prompt. */
export function renderMemoryCard(card: MemoryCard): string {
  if (isEmptyMemoryCard(card)) return "";

  const lines: string[] = ["What you remember about me:"];
  if (card.topic !== null) lines.push(`- Last time we talked about: ${card.topic}`);
  if (card.summary !== null) lines.push(`- What happened: ${card.summary}`);
  if (card.mistakes.length > 0) {
    lines.push(`- Mistakes I keep making: ${card.mistakes.slice(0, MEMORY_LIMITS.mistakes).join("; ")}`);
  }
  if (card.newWords.length > 0) {
    lines.push(`- New words I learned: ${card.newWords.slice(0, MEMORY_LIMITS.newWords).join(", ")}`);
  }
  lines.push("Bring this up naturally, like a friend would. Do not recite the list.");
  return lines.join("\n");
}
