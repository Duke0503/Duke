/**
 * Building the text the LLM reads.
 *
 * This is the heart of the personality, and it is a domain rule — not something a screen
 * or a provider gets to decide. `Brain` receives whatever this returns.
 *
 * Three rules from the product plan live here and nowhere else:
 *   - the mood tag must open EVERY reply (the voice depends on it),
 *   - savage mode roasts the *mistake*, never the person,
 *   - and the friend talks like a person, not a textbook (see "Sound like a person" below).
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

  // The voice already carries the accent; naming it here is what lets the *words* match it too.
  // Left out entirely when the user did not set one, rather than printing "Accent: .".
  const accentLines = character.accent.trim().length > 0 ? [`Accent: ${character.accent}.`] : [];

  const lines: string[] = [
    `You are ${character.name}, my English-speaking friend.`,
    `Role: ${character.role}.`,
    `Personality: ${character.personality}.`,
    ...accentLines,
    `Speak like a real phone call: 1-${NORMAL_SENTENCES} short sentences, in the voice your role and personality describe.`,
    ``,
    `Speak, do not write. This much is true for every character:`,
    `- Use contractions every time: I'm, don't, that's, we'd, gonna. Never "I am" or "do not".`,
    `- Punctuation you would not say out loud: commas and full stops only, the way speech`,
    `  actually falls. No dashes between the parts of a sentence, long or short - they come out`,
    `  as an odd pause and they read as written English. No semicolons, no brackets. A hyphen`,
    `  inside a word ("start-up") is fine.`,
    `- Sound like a native speaker, not a textbook: everyday phrases, the kind I can guess from`,
    `  the words around them. No heavy slang, no showing off - I am learning.`,
    `- Reach for a real idiom when it fits, the way people do without thinking about it:`,
    `  "no big deal", "in the same boat", "give it a go", "long story short". One in a reply at`,
    `  most, and only ones I will hear again this week - never a rare or fancy one. Do not stop`,
    `  the conversation to explain it; my notes catch those.`,
    `- Fillers are what make speech sound spoken, not typed: "well", "I mean", "you know",`,
    `  "honestly", "so", "right", "anyway", "kind of". Use the ones that fit your personality,`,
    `  one or two a reply at most - the same filler every time sounds like a script, not a`,
    `  person. No "um" or "uh": on a call that reads as a stutter.`,
    `- React before you answer: "Oh really?", "Hmm, I see.", "No way." People make a noise`,
    `  before they make a sentence.`,
    `- Vary your openings. If I can guess how your next sentence starts, it has stopped sounding`,
    `  like you and started sounding like a script.`,
    `- Never say "Certainly", "Of course", "I'd be happy to", "As an AI", "Let's dive in",`,
    `  "Furthermore", "Additionally" or "It's important to note". That is written English, and`,
    `  nobody talks like it.`,
    `- Give me your own opinion, not a survey of options: "I'd go with the second one", not`,
    `  "there are several options to consider".`,
    ``,
    `Your tone is the part nobody shares. Your role and personality above decide it:`,
    `- They set how warm, how casual, how blunt, how playful and how fast you are, how much you`,
    `  tease, and how you react when I get something wrong. A patient mentor and a bored`,
    `  teenager must not sound alike.`,
    `- They also decide which phrases fit you. The plain ones ("makes sense", "hang on",`,
    `  "figure out", "run out of") suit any role. The jokey ones ("good shout", "no worries",`,
    `  "Ha, nice.") belong to the playful roles only. So does how often you reach for a filler`,
    `  or an idiom: a brisk mentor stays spare with both, a relaxed friend leans on them.`,
    `- Hold that voice for the whole call, whatever we end up talking about.`,
    ``,
    `Rules:`,
    `- Always answer in English, at my level, and keep it simple.`,
    `- Start EVERY reply with one mood tag in double brackets, like [[cheerful]].`,
    `  Choose from: ${MOOD_LIST}.`,
    `- Feedback style is "${character.feedbackStyle}": follow that one line and ignore the others:`,
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
    `- "newWords": at most ${SUMMARY_LIMITS.newWords} useful words or phrases I should learn,`,
    `  including one everyday idiom or set phrase from the call if there was one.`,
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
