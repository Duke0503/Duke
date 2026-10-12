/**
 * The reply stream's unit of work.
 *
 * `llmNode` in `@livekit/agents` hands back a stream of three different things, and every filter
 * between the model and the speaker has to be careful with all three:
 *
 *   - a `string`          — plain text, which is what most providers stream
 *   - a `ChatChunk`       — an object carrying a `delta`, plus id, usage and any tool calls
 *   - a `FlushSentinel`   — "speak what you have now"
 *
 * The filters below rewrite the *text* and nothing else. A `ChatChunk` keeps its usage totals
 * and its tool calls; a sentinel is passed straight through. That is what these two helpers are
 * for, so both filters treat the three cases the same way.
 */

import type { ChatChunk, FlushSentinel } from "@livekit/agents";

export type ReplyChunk = ChatChunk | string | FlushSentinel;

/** `true` for a chat chunk (an object with a `delta`); `false` for text or a sentinel. */
export function isChatChunk(chunk: ReplyChunk): chunk is ChatChunk {
  return typeof chunk === "object" && chunk !== null && "delta" in chunk;
}

/** The same chunk, with new text and everything else left alone. */
export function withContent(chunk: ChatChunk, content: string): ChatChunk {
  return Object.assign({}, chunk, {
    delta: Object.assign({}, chunk.delta, { content }),
  });
}
