/**
 * Mood -> emotion.
 *
 * The LLM is told to start every reply with a mood tag, e.g. `[[cheerful]] Hi!`.
 * `stripMoodTag` removes it; the VoiceStyle map turns it into an Azure
 * `mstts:express-as` style. This is a domain rule, not UI code.
 */

export const MOODS = [
  "cheerful",
  "calm",
  "excited",
  "sad",
  "angry",
  "whisper",
  "teasing",
  "serious",
  "friendly",
  "curious",
  "surprised",
  "sympathetic",
] as const;

export type Mood = (typeof MOODS)[number];

export function isMood(value: string): value is Mood {
  return (MOODS as readonly string[]).includes(value);
}

export interface VoiceStyle {
  /** Azure style name, or null to use the voice's default. */
  readonly style: string | null;
  /** Azure `styledegree`. 1 is neutral; <1 softer, >1 stronger. */
  readonly degree: number;
}

export const MOOD_TO_STYLE: Readonly<Record<Mood, VoiceStyle>> = {
  cheerful: { style: "cheerful", degree: 1.2 },
  excited: { style: "excited", degree: 1.3 },
  sad: { style: "sad", degree: 1.0 },
  angry: { style: "angry", degree: 0.9 },
  whisper: { style: "whispering", degree: 1.0 },
  friendly: { style: "friendly", degree: 1.1 },
  surprised: { style: "excited", degree: 0.8 },
  serious: { style: null, degree: 1 },
  calm: { style: null, degree: 1 },
  teasing: { style: null, degree: 1 },
  curious: { style: null, degree: 1 },
  sympathetic: { style: null, degree: 1 },
};

const MOOD_TAG = /^\s*\[\[([a-zA-Z]+)\]\]\s*/;

export interface ParsedReply {
  readonly mood: Mood | null;
  /** The reply with the mood tag removed. */
  readonly speech: string;
}

export function stripMoodTag(text: string): ParsedReply {
  const match = MOOD_TAG.exec(text);
  const raw = match?.[1];
  if (match === null || raw === undefined) {
    return { mood: null, speech: text.trim() };
  }
  const candidate = raw.toLowerCase();
  const speech = text.slice(match[0].length).trim();
  return isMood(candidate) ? { mood: candidate, speech } : { mood: null, speech: text.trim() };
}

// ---------------------------------------------------------------- mood over a call

const ANY_MOOD_TAG = /\[\[([a-zA-Z]+)\]\]/g;

/** Every mood tag in a piece of text, in the order it appears. */
export function findMoods(text: string): Mood[] {
  const found: Mood[] = [];
  ANY_MOOD_TAG.lastIndex = 0;
  let match = ANY_MOOD_TAG.exec(text);
  while (match !== null) {
    const raw = match[1];
    if (raw !== undefined) {
      const candidate = raw.toLowerCase();
      if (isMood(candidate)) found.push(candidate);
    }
    match = ANY_MOOD_TAG.exec(text);
  }
  return found;
}

/**
 * The mood a call was mostly in, for the Session Detail screen and the History list.
 *
 * Ties go to whichever mood appeared first, so the result is stable for the same
 * transcript instead of depending on map iteration order.
 */
export function dominantMood(texts: readonly string[]): Mood | null {
  const counts = new Map<Mood, { count: number; first: number }>();
  let position = 0;

  for (const text of texts) {
    for (const mood of findMoods(text)) {
      const seen = counts.get(mood);
      if (seen === undefined) {
        counts.set(mood, { count: 1, first: position });
      } else {
        seen.count += 1;
      }
      position += 1;
    }
  }

  let best: Mood | null = null;
  let bestCount = 0;
  let bestFirst = Number.POSITIVE_INFINITY;

  for (const [mood, { count, first }] of counts) {
    if (count > bestCount || (count === bestCount && first < bestFirst)) {
      best = mood;
      bestCount = count;
      bestFirst = first;
    }
  }

  return best;
}

