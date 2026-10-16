/**
 * The live captions on a call.
 *
 * While a call is running, LiveKit relays each side's words to the room as they are spoken:
 * Deepgram's interim guesses for the learner, and the character's reply as it streams out of the
 * model. Both arrive as segments that are revised as they grow, and a segment only becomes
 * "final" once that speaker has stopped.
 *
 * That is the whole difficulty of showing them. The same line arrives again and again, and it has
 * to be replaced where it already is rather than appended — otherwise the screen fills with
 * half-sentences of the same sentence. This function is the rule for that, kept pure and out of
 * the screen so the screen has no bookkeeping of its own to get wrong.
 *
 * The words are the learner's own speech, so nothing here is stored: the full transcript is
 * recorded on the agent, once, and this is only what happens to be on the glass.
 */

/** One arriving piece of speech — structurally what the LiveKit client hands over. */
export interface CaptionSegment {
  readonly id: string;
  readonly text: string;
  readonly final: boolean;
}

/** Whose mouth the words came out of. */
export type CaptionSpeaker = "learner" | "character";

export interface CaptionLine {
  /** The segment id, so a revision can find its own line again. */
  readonly id: string;
  readonly speaker: CaptionSpeaker;
  readonly text: string;
  /** `false` while the words are still arriving. */
  readonly final: boolean;
}

/**
 * How many lines stay on the glass.
 *
 * A phone shows a handful before the text is a wall nobody reads, and the newest words are the
 * ones that matter. Old ones are dropped here only — the agent's recorder keeps everything.
 */
export const CAPTION_LIMIT = 8;

/**
 * Fold newly arrived speech into the list already on screen.
 *
 * Pure: same inputs, same output, no clock and no state. Returns a new array, so React sees a
 * change and re-renders.
 */
export function mergeCaptions(
  current: readonly CaptionLine[],
  incoming: readonly CaptionSegment[],
  speaker: CaptionSpeaker,
  limit: number = CAPTION_LIMIT,
): CaptionLine[] {
  const next = [...current];

  for (const segment of incoming) {
    const text = segment.text.trim();

    // An empty revision means "still deciding" — drawing it would be a blank line that pushes
    // the conversation around.
    if (text.length === 0) continue;

    const line: CaptionLine = { id: segment.id, speaker, text, final: segment.final };
    const at = next.findIndex((existing) => existing.id === segment.id);

    // A revision keeps its place. Moving it to the end would shuffle the screen every time
    // somebody finished a sentence.
    if (at === -1) next.push(line);
    else next[at] = line;
  }

  // `Math.max(0, …)` rather than `slice(-limit)`, because `slice(-0)` quietly means "all of it".
  return next.slice(Math.max(0, next.length - limit));
}
