/**
 * The mood filter, checked at the one thing it must never get wrong.
 *
 * A tag that reaches the speaker is the character reading "bracket bracket friendly" out loud,
 * and the model keeps offering them: one at the start as instructed, and sometimes another one
 * later when it changes its mind mid-sentence. The words arrive in pieces of no particular size,
 * so "is that a tag, or is that text?" has to be answered on a stream, not on a finished string.
 * These tests stream the tag in awkward pieces on purpose.
 */

import { describe, expect, it } from "vitest";
import type { ChatChunk } from "@livekit/agents";
import { stripMoodFromStream } from "./mood-filter";
import { isChatChunk, type ReplyChunk } from "./reply-chunk";

interface Spoken {
  /** One entry per piece of text that reached the speaker, in order. */
  readonly pieces: readonly string[];
  /** The same thing as the speaker would hear it. */
  readonly text: string;
  /** One entry per mood the voice was told to take. */
  readonly moods: readonly string[];
}

/** Run chunks through the filter and collect what came out. */
async function speak(chunks: ReplyChunk[]): Promise<Spoken> {
  const moods: string[] = [];

  const source = new ReadableStream<ReplyChunk>({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const reader = stripMoodFromStream(source, (mood) => moods.push(mood)).getReader();
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

  return { pieces, text: pieces.join(""), moods };
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

describe("stripMoodFromStream", () => {
  it("takes the leading tag off before the first word is spoken", async () => {
    const { text, moods } = await speak(["[[cheerful]] Hi there!"]);

    expect(text).toBe("Hi there!");
    expect(moods).toEqual(["cheerful"]);
  });

  it("holds a tag back when it arrives one character at a time", async () => {
    const { text, moods } = await speak([..."[[calm]] Breathe."]);

    expect(text).toBe("Breathe.");
    expect(moods).toEqual(["calm"]);
  });

  it("never lets a tag the model adds later reach the speaker", async () => {
    // The model does this when it changes its mind mid-reply. The voice follows the change —
    // `setMood` is read sentence by sentence — but the words it is given must be clean.
    const { text, moods } = await speak(["[[friendly]] Hmm, I see. ", "[[sad]] Right."]);

    expect(text).toBe("Hmm, I see. Right.");
    expect(text).not.toContain("[");
    expect(moods).toEqual(["friendly", "sad"]);
  });

  it("removes a later tag that arrives split across pieces", async () => {
    const { text, moods } = await speak(["Hi. ", "[[sa", "d]] Bye."]);

    expect(text).toBe("Hi. Bye.");
    expect(moods).toEqual(["sad"]);
  });

  it("speaks whatever is still held when the reply ends", async () => {
    // Holding text back is only safe because nothing is lost: whatever the filter is still
    // holding when the reply ends comes out here, so the tail of a reply is never silence.
    const { text } = await speak(["Wait [["]);

    expect(text).toBe("Wait [[");
  });

  it("rewrites a chat chunk's content and leaves the rest of it alone", async () => {
    const source = new ReadableStream<ReplyChunk>({
      start(controller): void {
        controller.enqueue(chatChunk("[[teasing]] Oh really? "));
        controller.close();
      },
    });

    const reader = stripMoodFromStream(source, () => undefined).getReader();
    const value = (await reader.read()).value as ChatChunk;

    expect(isChatChunk(value)).toBe(true);
    expect(value.id).toBe("chunk-1");
    expect(value.usage?.completionTokens).toBe(7);
    expect(value.delta?.content).toBe("Oh really? ");
  });

  it("passes a chunk that carries no words straight through", async () => {
    // A flush sentinel carries no text. If the filter swallowed it the speaker would stall.
    const { pieces } = await speak([chatChunk("All good. "), SENTINEL]);

    expect(pieces).toEqual(["All good. ", "\u0000non-text"]);
  });
});
