/**
 * Stripping the mood tag out of a **live** stream.
 *
 * `stripMoodTag` works on a finished reply. A call is not finished — the words arrive one
 * token at a time, and the first token that reaches the machine is very often just `[[` or
 * `[[cheer`. If we stripped per token, the two halves would each survive as if they were
 * ordinary text and the character would read punctuation out loud.
 *
 * So this class holds the start of the reply back until it knows whether a tag is really
 * there. It is a tiny state machine, and it is a domain rule, not UI code:
 *
 *   - before the tag: hold text back, because it might be a tag
 *   - the moment the tag (or the first real word) is known: let everything through
 *
 * The caller feeds it every chunk and passes on what comes back. Nothing is lost: whatever is
 * still held when the reply ends comes out of `flush`.
 */

import { isMood, type Mood } from "./mood";

export interface MoodStreamChunk {
  /** The text to speak, with any leading mood tag removed. Often `""`. */
  readonly text: string;
  /** Set once, on the chunk that carried the tag. */
  readonly mood: Mood | null;
}

const TAG_OPEN = "[[";

/**
 * How long we are willing to hold the start of a reply while looking for a tag.
 *
 * The longest real tag — `[[sympathetic]]` — is 16 characters. Past this the "tag" is
 * something else, and holding the text back would delay the character's first word.
 */
const MAX_TAG_CHARS = 24;

const TAG = /^\[\[([a-zA-Z]+)\]\]\s*/;

export class MoodTagStripper {
  /** `leading` = we are still behind the tag; `open` = the tag is settled, pass text through. */
  private state: "leading" | "open" = "leading";
  private buffer = "";
  private mood: Mood | null = null;
  /**
   * The whitespace after a tag can arrive in the chunk *after* the tag (the model streams
   * `[[calm]]`, then ` Breathe.`). It is not speech, so swallow it.
   */
  private skipSpace = false;

  /** The mood found so far, if any. */
  get found(): Mood | null {
    return this.mood;
  }

  /** Feed the next piece of the reply. Returns the text that is safe to speak now. */
  push(chunk: string): MoodStreamChunk {
    if (this.state === "open") {
      const text = this.skipSpace ? chunk.replace(/^\s+/, "") : chunk;
      if (text.length > 0) this.skipSpace = false;
      return { text, mood: null };
    }

    this.buffer += chunk;
    const leading = this.buffer.replace(/^\s*/, "");

    // A lone "[" may still become "[[" — wait for the next chunk instead of leaking it.
    if (leading.length < TAG_OPEN.length && TAG_OPEN.startsWith(leading)) {
      return { text: "", mood: null };
    }

    // No tag: this is just the character talking. Let the held text go.
    if (!leading.startsWith(TAG_OPEN)) {
      return this.release(this.buffer);
    }

    const match = TAG.exec(leading);
    if (match !== null) {
      const word = (match[1] ?? "").toLowerCase();
      if (isMood(word)) this.mood = word;
      // `leading` had the leading whitespace trimmed off, and that whitespace was not speech.
      return this.release(leading.slice(match[0].length));
    }

    // Still not a whole tag. Keep waiting, but not forever.
    if (leading.length > MAX_TAG_CHARS) {
      return this.release(this.buffer);
    }

    return { text: "", mood: null };
  }

  /** Whatever is still held when the reply ends. Never drops text. */
  flush(): string {
    return this.release(this.buffer).text;
  }

  private release(text: string): MoodStreamChunk {
    this.buffer = "";
    this.state = "open";
    // If the tag was all we had, the next chunk may start with the space that followed it.
    this.skipSpace = text.length === 0;
    return { text, mood: this.mood };
  }
}
