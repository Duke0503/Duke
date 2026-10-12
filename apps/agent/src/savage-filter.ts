/**
 * The second line of defence for savage mode.
 *
 * The first line is the prompt: `buildPrompt` tells a savage character to roast the *mistake*
 * and never the person. Prompts are not guarantees, so this filter reads what the model actually
 * said before the voice says it.
 *
 * Two decisions worth writing down:
 *
 *   1. **Sentences, not tokens.** A reply is spoken as it arrives — the first sentence is
 *      already being read out while the third is still streaming. So the check has to happen on
 *      a unit that is complete but still early. That unit is the sentence, which is exactly what
 *      the Azure plugin already waits for before it starts synthesising: this filter adds no
 *      delay a listener can hear.
 *
 *   2. **Only in savage mode.** `checkSavage` is conservative on purpose, and a false positive
 *      costs a rewritten line. A friendly English teacher saying "I hate that construction" is
 *      a perfectly good sentence that the rule about hostility would flag. Outside savage mode
 *      the prompt never asked for roasting, so the guard is off and the teacher keeps the line.
 *
 * A flagged sentence is replaced with `SAFE_FALLBACK_LINE` from `@duke/core`, in the same voice,
 * and the reason is logged. Rewriting by asking the model again would mean a second round trip
 * with the microphone open — the learner hears dead air. One safe sentence is better.
 */

import { SAFE_FALLBACK_LINE, checkSavage } from "@duke/core";
import { isChatChunk, withContent, type ReplyChunk } from "./reply-chunk";

const SENTENCE_PUNCTUATION = ".!?…";
/** Closing quotes and brackets belong to the sentence that ends before them. */
const CLOSERS = "\"')]";

/**
 * Words that end in a full stop without ending a sentence.
 *
 * Short, and deliberately only the ones that turn up in spoken English. A word that is not here
 * and is not caught by the two rules below is treated as the end of a sentence.
 */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr",
  "etc", "eg", "ie", "vs", "al", "no", "fig", "approx", "inc", "ltd", "dept",
]);

/** The word immediately before `index` — letters and dots only. */
function wordBefore(text: string, index: number): string {
  let start = index;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1] as string)) start -= 1;
  return text.slice(start, index);
}

/**
 * Is the punctuation at `index` the end of a sentence — or part of a number or an abbreviation?
 *
 * The whole difficulty of this filter is here. Streamed replies contain "3.5" and "e.g." and
 * "Mr.", and all of them look like a full stop. Splitting on those would cut a sentence in half
 * and hand the guard two fragments, which is worse than useless: neither fragment contains the
 * whole insult.
 *
 * Three rules, all cheap and all readable:
 *
 *   - a **digit** before the stop is a decimal number — `3.5`, `12.30`
 *   - a word with a **dot inside it** is `e.g.` or `U.S.`, not a sentence
 *   - a **single letter** or a **word from the list** is `J.` or `Mr.`, not a sentence
 *
 * The cost is that a full stop straight after a bare number ("That's 20. Nice.") is skipped, so
 * the sentence waits and joins the next one. The guard still reads all of it — nothing is missed,
 * it is just checked as a slightly longer unit.
 */
function isSentenceEnd(text: string, index: number): boolean {
  const previous = text[index - 1];
  if (previous === undefined) return false;

  if (previous >= "0" && previous <= "9") return false;

  const word = wordBefore(text, index).toLowerCase();
  if (word.includes(".")) return false;
  if (word.length === 1) return false;
  if (ABBREVIATIONS.has(word)) return false;

  return true;
}

/**
 * Where the next complete sentence ends, or `null` if one has not arrived yet.
 *
 * "Not yet" is the common case while a reply is streaming, and it is why this returns an index
 * instead of a string: everything before it can be spoken, and everything after it has to wait.
 */
function endOfSentence(text: string): number | null {
  for (let index = 0; index < text.length; index += 1) {
    if (!SENTENCE_PUNCTUATION.includes(text[index] as string)) continue;
    if (!isSentenceEnd(text, index)) continue;

    let cursor = index;
    while (cursor < text.length && SENTENCE_PUNCTUATION.includes(text[cursor] as string)) {
      cursor += 1;
    }
    while (cursor < text.length && CLOSERS.includes(text[cursor] as string)) cursor += 1;

    // A boundary is followed by whitespace. Without it, this is a full stop in the middle of a
    // number or a word, and the sentence is not over.
    if (cursor >= text.length || !/\s/.test(text[cursor] as string)) continue;
    while (cursor < text.length && /\s/.test(text[cursor] as string)) cursor += 1;

    return cursor;
  }

  return null;
}

/** Holds the tail of a reply until it is a whole sentence, checks it, then lets it go. */
class SentenceGuard {
  private held = "";

  constructor(private readonly onFlag: (reason: string) => void) {}

  /** Feed the next piece of text; returns only the part that is safe to speak now. */
  take(text: string): string {
    this.held += text;
    return this.drain(false);
  }

  /** The end of the reply: check whatever never reached a full stop. */
  flush(): string {
    return this.drain(true);
  }

  private drain(final: boolean): string {
    let out = "";

    for (;;) {
      const end = endOfSentence(this.held);
      if (end === null) break;
      out += this.check(this.held.slice(0, end));
      this.held = this.held.slice(end);
    }

    if (final && this.held.length > 0) {
      out += this.check(this.held);
      this.held = "";
    }

    return out;
  }

  private check(sentence: string): string {
    const verdict = checkSavage(sentence);
    if (verdict.allowed) return sentence;

    this.onFlag(verdict.reason);
    // Keep whatever whitespace the sentence ended with, so the next one does not run into it.
    const trailing = /\s+$/.exec(sentence)?.[0] ?? " ";
    return `${SAFE_FALLBACK_LINE}${trailing}`;
  }
}

/**
 * Wrap a reply stream so no forbidden line reaches the speaker.
 *
 * Place this **after** `stripMoodFromStream`: the mood tag must be gone before a sentence is
 * checked, or `[[angry]]` would be part of the text being judged.
 */
export function guardSavageStream(
  stream: ReadableStream<ReplyChunk>,
  onFlag: (reason: string) => void,
): ReadableStream<ReplyChunk> {
  const guard = new SentenceGuard(onFlag);

  return stream.pipeThrough(
    new TransformStream<ReplyChunk, ReplyChunk>({
      transform(chunk, controller): void {
        if (typeof chunk === "string") {
          const out = guard.take(chunk);
          if (out.length > 0) controller.enqueue(out);
          return;
        }

        if (!isChatChunk(chunk)) {
          controller.enqueue(chunk);
          return;
        }

        const content = chunk.delta?.content;
        if (content === undefined) {
          controller.enqueue(chunk);
          return;
        }

        const out = guard.take(content);
        if (out.length === 0) return;

        controller.enqueue(withContent(chunk, out));
      },

      flush(controller): void {
        const rest = guard.flush();
        if (rest.length > 0) controller.enqueue(rest);
      },
    }),
  );
}
