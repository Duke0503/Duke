/**
 * Making a dash impossible in the spoken reply.
 *
 * `build-prompt.ts` tells the character not to put a dash between the parts of a sentence, and a
 * 20B model at low effort keeps that rule most of the time. The rest of the time it does not, and
 * an em dash, an en dash or a non-breaking hyphen reaches Azure, which either reads the pause the
 * character never meant or swallows the word. A rule the model is *asked* to keep is a
 * suggestion, so this is where it stops being one: whatever arrives, the machine never sees a
 * dash it could speak.
 *
 * The rewrite is deliberately narrow, because a hyphen is often correct English. Only the shapes
 * that cannot sit inside a word become a comma:
 *
 *   - an em dash, an en dash, a horizontal bar, a figure dash or a minus sign, always
 *   - a hyphen with whitespace on both sides (`came home - tired`), because a hyphen inside a
 *     word never has spaces around it
 *   - a non-breaking hyphen used the same way. On its own it is normalized to a plain hyphen,
 *     which is what it is actually for: `well-known` must never become `well, known`.
 *
 * The streaming problem is the one `MoodTagStripper` already has. `came home -` and ` tired` can
 * arrive as two chunks, and it is the space that decides whether that hyphen was a dash, so the
 * tail of the text is held back while it is still ambiguous and released by `flush` when the
 * reply ends. Nothing is dropped, ever.
 */

/**
 * A trailing run that could still turn out to be a dash: whitespace, or any hyphen or dash.
 *
 * Only the tail is held, so the character never waits for a word — at most a space or a dash
 * that was not going to be spoken yet anyway.
 */
const AMBIGUOUS_TAIL = /[\s\u2010-\u2015\u2212-]+$/u;

/** Every dash that is never part of a word. */
const LONG_DASH = /[\u2012\u2013\u2014\u2015\u2212]/gu;

/** A non-breaking hyphen with room on both sides is being used as a dash. */
const SPACED_NON_BREAKING_HYPHEN = /[ \t]+\u2011[ \t]+/gu;

/** The same reading for a plain hyphen, or the hyphen character U+2010. */
const SPACED_HYPHEN = /[ \t]+[\u2010-]+[ \t]+/gu;

/**
 * The rule itself.
 *
 * `atStart` exists for the live stream, and only for it. A whole reply never opens with a comma,
 * so `rewriteDashes` strips one. A *chunk* very often does: when the model streams `came home -`
 * and then ` tired`, the comma this rule makes belongs after "home", and stripping it because it
 * happens to sit at the front of that chunk would read the reply back as "came hometired".
 *
 * `atEnd` is the same idea at the other end: a comma with nothing after it is not speech, but a
 * chunk may well stop right after one and carry on in the next, so only a finished reply loses it.
 */
function rewrite(text: string, atStart: boolean, atEnd: boolean): string {
  let out = text;

  out = out.replace(LONG_DASH, ",");
  out = out.replace(SPACED_NON_BREAKING_HYPHEN, ",");
  out = out.replace(/\u2011/gu, "-");
  out = out.replace(SPACED_HYPHEN, ",");

  // A dash with nothing after it was never a dash: the reply ended, or the model trailed off.
  // `flush` reaches here with a held `-` that had no following word to decide it, and a person
  // does not say "dash" at the end of a sentence.
  out = out.replace(/[ \t]*[\u2010-\u2015\u2212-]+[ \t]*$/u, "");

  // Tidy up around the commas the rewrite just made. These lines are what turn `word , b`,
  // `word,b` and `a , , b` into a plain `word, b`, so the character never reads a stray mark.
  out = out.replace(/[ \t]+,/gu, ",");
  out = out.replace(/,(?=\S)/gu, ", ");
  out = out.replace(/,\s*,/gu, ",");
  if (atStart) out = out.replace(/^[ \t]*,[ \t]*/u, "");
  if (atEnd) out = out.replace(/,[ \t]*$/u, "");

  return out;
}

/**
 * Turn every dash in a finished `text` into a comma.
 *
 * Exported because both the live stream and the tests want to say "run the rule on this string"
 * without a stream around it.
 */
export function rewriteDashes(text: string): string {
  return rewrite(text, true, true);
}

/**
 * Feed it the live tokens, speak what comes back, and call `flush` when the reply ends.
 *
 * One instance per reply, exactly like `MoodTagStripper`.
 */
export class DashRewriter {
  /** The tail that is still ambiguous: whitespace or a dash we cannot read yet. */
  private held = "";

  /** True until the reply has said something. A reply cannot open with a comma; a chunk can. */
  private atStart = true;

  /** Rewrite what can be decided now, and hold back the rest. */
  push(text: string): string {
    const combined = this.held + text;
    const tail = AMBIGUOUS_TAIL.exec(combined);
    const cut = tail === null ? 0 : tail[0].length;

    this.held = combined.slice(combined.length - cut);
    const out = rewrite(combined.slice(0, combined.length - cut), this.atStart, false);
    if (/\S/u.test(out)) this.atStart = false;
    return out;
  }

  /** Whatever is still held when the reply ends. Never empty of meaning, never dropped. */
  flush(): string {
    const out = rewrite(this.held, this.atStart, true);
    this.held = "";
    this.atStart = false;
    return out;
  }
}
