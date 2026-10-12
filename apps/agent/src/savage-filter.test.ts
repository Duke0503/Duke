/**
 * The savage guard, checked where it is risky: the sentence boundary.
 *
 * The filter's hard part is not deciding what is forbidden — `checkSavage` already does that and
 * has its own tests. It is deciding **when a sentence is finished**, on a stream that arrives in
 * pieces of no particular size. If that is wrong the filter either leaks a bad line or cuts a
 * good one in half, and both of those only show up on a real call. So these tests stream text in
 * awkward pieces on purpose, and assert on the **pieces that come out**, not just the joined
 * text: buffering is invisible once the text is concatenated, and buffering is the feature.
 */

import { describe, expect, it } from "vitest";
import { SAFE_FALLBACK_LINE } from "@duke/core";
import type { ChatChunk } from "@livekit/agents";
import { guardSavageStream } from "./savage-filter";
import { isChatChunk, type ReplyChunk } from "./reply-chunk";

interface Guarded {
  /** One entry per piece of text that reached the speaker, in order. */
  readonly pieces: readonly string[];
  /** The same thing as the speaker would hear it. */
  readonly text: string;
  /** One entry per sentence the guard rewrote. */
  readonly flags: readonly string[];
}

/** Run chunks through the guard and collect what came out. */
async function guard(chunks: ReplyChunk[]): Promise<Guarded> {
  const flags: string[] = [];

  const source = new ReadableStream<ReplyChunk>({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const reader = guardSavageStream(source, (reason) => flags.push(reason)).getReader();
  const pieces: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (typeof value === "string") {
      pieces.push(value);
      continue;
    }
    if (isChatChunk(value)) {
      const content = value.delta?.content;
      if (typeof content === "string") pieces.push(content);
      continue;
    }
    // A sentinel, or anything else that is not text.
    pieces.push("\u0000non-text");
  }

  return { pieces, text: pieces.join(""), flags };
}

/** A chunk shaped like the ones the OpenAI plugin streams. */
function chatChunk(content: string): ChatChunk {
  return {
    id: "chunk-1",
    delta: { role: "assistant", content },
    usage: { completionTokens: 7 },
  } as unknown as ChatChunk;
}

/** Not a chat chunk and not text: what a flush sentinel looks like from here. */
const SENTINEL = Symbol("flush") as unknown as ReplyChunk;

describe("guardSavageStream", () => {
  it("lets a friendly reply through, even in pieces", async () => {
    const { text, flags } = await guard(["That's ", "a good ", "sentence. ", "Keep going."]);
    expect(text).toBe("That's a good sentence. Keep going.");
    expect(flags).toEqual([]);
  });

  it("holds a piece back until the sentence is finished, then emits it whole", async () => {
    // "Two and a half" is pushed with no full stop, so it must NOT come out yet: it comes out
    // joined to " done. " as one sentence. That is the buffering, and this is the only way to
    // see it — concatenated text looks the same either way.
    const { pieces } = await guard(["One. ", "Two and a half", " done. ", "Three"]);
    expect(pieces).toEqual(["One. ", "Two and a half done. ", "Three"]);
  });

  it("replaces a forbidden sentence and says why", async () => {
    const { text, flags } = await guard(["Nice try. ", "You are an idiot. ", "Try once more."]);
    expect(text).toContain("Nice try.");
    expect(text).toContain(SAFE_FALLBACK_LINE);
    expect(text).not.toContain("idiot");
    expect(text).toContain("Try once more.");
    expect(flags).toEqual(["insulting intelligence"]);
  });

  it("rewrites a forbidden sentence before it is spoken, not after", async () => {
    // The fallback must arrive as one piece, in place of the sentence — proof the guard read
    // the sentence while it was still being generated rather than at the end of the reply.
    const { pieces } = await guard(["Good point. ", "You are an idiot."]);
    expect(pieces).toEqual(["Good point. ", `${SAFE_FALLBACK_LINE} `]);
  });

  it("catches a forbidden line in the tail of a reply that never ended", async () => {
    const { text, flags } = await guard(["Honestly, nobody likes you"]);
    expect(text).toBe(`${SAFE_FALLBACK_LINE} `);
    expect(flags).toEqual(["cruel put-down"]);
  });

  it("keeps a sentence's trailing space, so the next one does not run into the fallback", async () => {
    const { text } = await guard(["You are stupid. ", "Next point."]);
    expect(text).toBe(`${SAFE_FALLBACK_LINE} Next point.`);
  });

  it("does not treat a number or an abbreviation as a sentence end", async () => {
    // "3.5", "e.g." and "Mr." all look like a full stop followed by a space. None of them ends a
    // sentence: splitting there would hand the guard half a sentence, which is worse than none.
    const { pieces, flags } = await guard([
      "It costs 3.5 dollars, e.g. ",
      "a coffee. ",
      "Mr. Smith left. ",
    ]);
    expect(pieces).toEqual([
      "It costs 3.5 dollars, e.g. a coffee. ",
      "Mr. Smith left. ",
    ]);
    expect(flags).toEqual([]);
  });

  it("rewrites a chat chunk's content and leaves the rest of it alone", async () => {
    const chunk = chatChunk("You are ugly. ");
    const source = new ReadableStream<ReplyChunk>({
      start(controller): void {
        controller.enqueue(chunk);
        controller.close();
      },
    });

    const reader = guardSavageStream(source, () => undefined).getReader();
    const first = await reader.read();
    const value = first.value as ChatChunk;

    expect(isChatChunk(value)).toBe(true);
    expect(value.id).toBe("chunk-1");
    expect(value.usage?.completionTokens).toBe(7);
    expect(value.delta?.content).toBe(`${SAFE_FALLBACK_LINE} `);
  });

  it("passes a chunk that carries no words straight through", async () => {
    // A flush sentinel carries no text. If the guard swallowed it the speaker would stall.
    const { pieces } = await guard([chatChunk("All good. "), SENTINEL]);
    expect(pieces).toEqual(["All good. ", "\u0000non-text"]);
  });
});
