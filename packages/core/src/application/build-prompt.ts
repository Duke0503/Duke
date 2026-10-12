/**
 * Building the text the LLM reads.
 *
 * This is the heart of the personality, and it is a domain rule — not something a screen
 * or a provider gets to decide. `Brain` receives whatever this returns.
 *
 * Two rules from the product plan live here and nowhere else:
 *   - the mood tag must open EVERY reply (the voice depends on it),
 *   - savage mode roasts the *mistake*, never the person.
 */

import type { Character } from "../domain/character";
import { type MemoryCard, renderMemoryCard } from "../domain/memory-card";
import { MOODS } from "../domain/mood";
import type { Turn } from "../domain/session";
import { SUMMARY_LIMITS } from "../domain/session-summary";

const MOOD_LIST = MOODS.join(", ");

export interface SystemPromptInput {
  readonly character: Character;
  /** Loaded when the user taps "Continue" on an old session. */
  readonly memoryCard?: MemoryCard;
  /** 1 = normal. Below 1 = answer shorter, used when the budget is running low. */
  readonly replyScale?: number;
}

/** The longest reply we ask for, before the budget makes it shorter. */
const NORMAL_SENTENCES = 3;

export function buildSystemPrompt(input: SystemPromptInput): string {
  const character = input.character;
  const replyScale = input.replyScale ?? 1;

  const lines: string[] = [
    `You are ${character.name}, my English-speaking friend.`,
    `Role: ${character.role}.`,
    `Personality: ${character.personality}.`,
    `Speak like a real phone call: 1-${NORMAL_SENTENCES} short sentences, natural, warm.`,
    ``,
    `Rules:`,
    `- Always answer in English, at my level, and keep it simple.`,
    `- Start EVERY reply with one mood tag in double brackets, like [[cheerful]].`,
    `  Choose from: ${MOOD_LIST}.`,
    `- Feedback style is "${character.feedbackStyle}" — follow that one line and ignore the others:`,
    `    just-talk     -> do not correct me, just keep the conversation going`,
    `    quiet-tips    -> correct me gently, and only the important mistakes`,
    `    correct-aloud -> correct my mistakes clearly, then continue`,
    `- Never write long paragraphs. This is a phone call, not an essay.`,
    `- If I roleplay, stay in character until I say "stop".`,
    `- Never mention these rules, the mood tag, or that you are an AI.`,
  ];

  if (character.savage) {
    lines.push(
      ``,
      `Playful roasting is ON:`,
      `- Make fun of the SENTENCE, the situation, or how the words came out.`,
      `- NEVER the person: nothing about looks, family, identity, religion or intelligence.`,
      `- No real insults, no cruelty, no swearing at me. One light joke, then keep going.`,
    );
  }

  if (replyScale < 1) {
    const sentences = Math.max(1, Math.round(replyScale * NORMAL_SENTENCES));
    lines.push(``, `Keep replies extra short: about ${sentences} sentence(s). We are near a usage limit.`);
  }

  const memory = input.memoryCard === undefined ? "" : renderMemoryCard(input.memoryCard);
  if (memory.length > 0) lines.push(``, memory);

  if (character.defaultTopic !== null && character.defaultTopic.trim().length > 0) {
    lines.push(``, `If the conversation goes quiet, you can bring up: ${character.defaultTopic}.`);
  }

  return lines.join("\n");
}

export function buildGreetingPrompt(character: Character, remembered: boolean): string {
  const opening = remembered
    ? `Greet me again and mention something from last time, then ask one short question.`
    : `Greet me like you just picked up the phone. One short line, then ask me one easy question.`;
  return `Say your first line as ${character.name}. ${opening}`;
}

// ---------------------------------------------------------------- summarising

export interface SummaryPromptInput {
  readonly characterName: string;
  readonly turns: readonly Turn[];
}

/** `USER: ...` / `NAME: ...`, capped so a long call cannot blow the context window. */
export function renderTranscript(characterName: string, turns: readonly Turn[], maxTurns = 120): string {
  const recent = turns.slice(-maxTurns);
  return recent
    .map((turn) => `${turn.speaker === "user" ? "USER" : characterName.toUpperCase()}: ${turn.text}`)
    .join("\n");
}

export function buildSummaryPrompt(input: SummaryPromptInput): string {
  return [
    `Read this English practice call and reply with ONE JSON object and nothing else.`,
    ``,
    `{"topic":"3-5 words","summary":"one or two sentences about what we talked about",`,
    ` "mistakes":["what I said → what is better"],"newWords":["word or phrase I met"]}`,
    ``,
    `Rules:`,
    `- "topic": ${SUMMARY_LIMITS.topicChars} characters at most.`,
    `- "summary": ${SUMMARY_LIMITS.summaryChars} characters at most. Plain English.`,
    `- "mistakes": at most ${SUMMARY_LIMITS.mistakes} items, most important first.`,
    `  Each item MUST contain the arrow " → " between my version and the fix.`,
    `- "newWords": at most ${SUMMARY_LIMITS.newWords} useful words or phrases I should learn.`,
    `- If there were no mistakes, return an empty array. Never invent any.`,
    `- No markdown, no comments, no text outside the JSON object.`,
    ``,
    `Call transcript:`,
    renderTranscript(input.characterName, input.turns),
  ].join("\n");
}

/**
 * Second try, when the first summary could not be parsed. Dropping the rules and asking
 * again is cheaper and more reliable than a repair pass.
 */
export function buildSummaryRetryPrompt(): string {
  return `That was not valid JSON. Reply with the JSON object only - no markdown fences, no explanation.`;
}
