/**
 * The dash filter, checked at the one thing it must never get wrong.
 *
 * The prompt asks the character not to put a dash between the parts of a sentence, and the model
 * mostly obeys. This filter is what makes it true rather than requested: an em dash, an en dash
 * or a non-breaking hyphen must never reach the voice, no matter how the model streams it. The
 * words arrive in pieces of no particular size, so "is that a dash, or is that a hyphenated
 * word?" has to be answered on a stream. These tests stream the dashes in awkward pieces.
 */

import { describe, expect, it } from "vitest";
import type { ChatChunk } from "@livekit/agents";
import { stripDashesFromStream } from "./dash-filter";
import { isChatChunk, type ReplyChunk } from "./reply-chunk";

const EM = "\u2014";
const EN = "\u2013";
const NB_HYPHEN = "\u2011";

interface Spoken {
  /** One entry per piece of text that reached the speaker, in order. */
  readonly pieces: readonly string[];
  /** The same thing as the speaker would hear it. */
  readonly text: string;
}

/** Run chunks through the filter and collect what came out. */
async function speak(chunks: ReplyChunk[]): Promise<Spoken> {
  const source = new ReadableStream<ReplyChunk>({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const reader = stripDashesFromStream(source).getReader();
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

  return { pieces, text: pieces.join("") };
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

describe("stripDashesFromStream", () => {
  it("never lets an em dash reach the speaker", async () => {
    const { text } = await speak([`I was tired ${EM} really tired.`]);

    expect(text).toBe("I was tired, really tired.");
  });

  it("decides a dash that arrives split across two pieces", async () => {
    // The whole point of holding the tail back: the space that follows decides whether that
    // hyphen was a dash or part of a word, and it has not arrived yet.
    const { text } = await speak(["I came home -", " tired."]);

    expect(text).toBe("I came home, tired.");
  });

  it("keeps a hyphen that is inside a word, even when the word is split", async () => {
    const { text } = await speak(["a well-", "known problem"]);

    expect(text).toBe("a well-known problem");
  });

  it("normalizes a non-breaking hyphen inside a word", async () => {
    const { text } = await speak([`well${NB_HYPHEN}known, honestly.`]);

    expect(text).toBe("well-known, honestly.");
  });

  it("does not speak a dash it was still holding when the reply ended", async () => {
    const { text } = await speak(["It was fine -"]);

    expect(text).toBe("It was fine");
  });

  it("still speaks the rest of a tail it was holding", async () => {
    const { text } = await speak([`Anyway ${EN} `, "you know."]);

    expect(text).toBe("Anyway, you know.");
  });

  it("rewrites a chat chunk's content and leaves the rest of it alone", async () => {
    const source = new ReadableStream<ReplyChunk>({
      start(controller): void {
        controller.enqueue(chatChunk("He came \u2013 late."));
        controller.close();
      },
    });

    const reader = stripDashesFromStream(source).getReader();
    const value = (await reader.read()).value as ChatChunk;

    expect(isChatChunk(value)).toBe(true);
    expect(value.id).toBe("chunk-1");
    expect(value.usage?.completionTokens).toBe(7);
    expect(value.delta?.content).toBe("He came, late.");
  });

  it("passes a chunk that carries no words straight through", async () => {
    // A flush sentinel carries no text. If the filter swallowed it the speaker would stall.
    const { pieces } = await speak([chatChunk("All good."), SENTINEL]);

    expect(pieces).toEqual(["All good.", "\u0000non-text"]);
  });
});
