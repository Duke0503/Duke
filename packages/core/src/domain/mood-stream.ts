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
 *   - after that: a tag can still turn up. The model repeats one, or changes its mind in the
 *     middle of a sentence, and a tag read out loud ("bracket bracket friendly") is worse than
 *     any tag we could be fooled into dropping. So they come off here too.
 *
 * The caller feeds it every chunk and passes on what comes back. Nothing is lost: whatever is
 * still held when the reply ends comes out of `flush`.
 */

import { isMood, type Mood } from "./mood";

export interface MoodStreamChunk {
  /** The text to speak, with any mood tag removed. Often `""`. */
  readonly text: string;
  /** Set on the chunk that carried a tag, the leading one or a later one. */
  readonly mood: Mood | null;
}

const TAG_OPEN = "[[";

/**
 * How long we are willing to hold text back while looking for a tag.
 *
 * The longest real tag — `[[sympathetic]]` — is 16 characters. Past this the "tag" is
 * something else, and holding the text back would delay the character's first word.
 */
const MAX_TAG_CHARS = 24;

const TAG = /^\[\[([a-zA-Z]+)\]\]\s*/;

/** The same shape, but anywhere in the text rather than only at the start. */
const TAG_ANYWHERE = /\[\[([a-zA-Z]+)\]\]\s*/g;

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
      return this.inside(text);
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
    const rest = this.clean(this.buffer).text;
    this.buffer = "";
    this.state = "open";
    this.skipSpace = false;
    return rest;
  }

  /**
   * The reply is under way. Everything after the leading tag passes through here, so this is
   * where a tag the model adds later comes off. The mood of the last one is the mood to speak:
   * a model only repeats the tag when it wants the emotion to change, and `setMood` is read
   * sentence by sentence, so following it costs nothing.
   */
  private inside(text: string): MoodStreamChunk {
    const { text: cleaned, mood } = this.clean(this.buffer + text);
    this.buffer = "";
    if (mood !== null) this.mood = mood;

    // A tag can straddle two chunks here as well: hold its start back, but not for long.
    const held = pendingTagLength(cleaned);
    if (held === 0) return { text: cleaned, mood };

    this.buffer = cleaned.slice(cleaned.length - held);
    return { text: cleaned.slice(0, cleaned.length - held), mood };
  }

  /** The text with every complete tag taken out, and the mood of the last one it carried. */
  private clean(text: string): { text: string; mood: Mood | null } {
    let mood: Mood | null = null;
    let cleaned = "";
    let cursor = 0;

    for (const match of text.matchAll(TAG_ANYWHERE)) {
      const start = match.index ?? 0;
      cleaned += text.slice(cursor, start);
      cursor = start + match[0].length;
      const word = (match[1] ?? "").toLowerCase();
      if (isMood(word)) mood = word;
    }

    return { text: cleaned + text.slice(cursor), mood };
  }

  private release(text: string): MoodStreamChunk {
    this.state = "open";
    this.buffer = "";
    // If the tag was all we had, the next chunk may start with the space that followed it.
    this.skipSpace = text.length === 0;
    const out = this.inside(text);
    // The leading mood was recorded before we got here; a second tag in the same chunk wins.
    return { text: out.text, mood: out.mood ?? this.mood };
  }
}

/**
 * How many characters at the end of `text` might be the start of a tag, and so should wait for
 * the next chunk. `0` means the whole text is safe to speak.
 */
function pendingTagLength(text: string): number {
  const open = text.lastIndexOf(TAG_OPEN);

  if (open === -1) return text.endsWith("[") ? 1 : 0;

  // An opening that already closed is not a tag we are waiting for; one that never closes is
  // worth waiting for only while it could still turn into a real tag.
  const tail = text.slice(open);
  if (tail.includes("]]")) return 0;
  return tail.length <= MAX_TAG_CHARS ? tail.length : 0;
}
