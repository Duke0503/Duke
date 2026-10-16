/**
 * The dash rule, as a stage in the live reply stream.
 *
 * `DashRewriter` in `@duke/core` is the rule itself; this file is the LiveKit-shaped wrapper
 * around it, for the same reason `mood-filter.ts` sits next to `MoodTagStripper`. A reply arrives
 * as a mix of plain text, chat chunks and sentinels that carry neither, one token at a time, and
 * the rule has to hold an undecided tail back across those boundaries rather than decide it
 * per token.
 *
 * It runs *after* the mood tag is gone, so what it sees is what the character would have said.
 */

import { DashRewriter } from "@duke/core";
import { isChatChunk, withContent, type ReplyChunk } from "./reply-chunk";

export type { ReplyChunk };

export function stripDashesFromStream(
  stream: ReadableStream<ReplyChunk>,
): ReadableStream<ReplyChunk> {
  const rewriter = new DashRewriter();

  return stream.pipeThrough(
    new TransformStream<ReplyChunk, ReplyChunk>({
      transform(chunk, controller): void {
        // Plain text, which is what most providers stream.
        if (typeof chunk === "string") {
          const out = rewriter.push(chunk);
          if (out.length > 0) controller.enqueue(out);
          return;
        }

        // Anything that is not a chat chunk — a flush sentinel, say — must still get through.
        if (!isChatChunk(chunk)) {
          controller.enqueue(chunk);
          return;
        }

        const content = chunk.delta?.content;
        if (content === undefined) {
          controller.enqueue(chunk);
          return;
        }

        const out = rewriter.push(content);
        if (out.length === 0) return;

        controller.enqueue(withContent(chunk, out));
      },

      flush(controller): void {
        // A reply ending on "fine -" leaves that dash held; it is dropped, not spoken.
        const rest = rewriter.flush();
        if (rest.length > 0) controller.enqueue(rest);
      },
    }),
  );
}
