/**
 * Taking the mood tag off the live token stream.
 *
 * The character is told to open every reply with `[[mood]]`. That tag is an instruction to
 * us — it becomes the Azure emotion — and must never be spoken, shown, or written into the
 * transcript. `MoodTagStripper` in `@duke/core` does the tricky part (the tag can be split
 * across two tokens); this file is the LiveKit-shaped wrapper around it.
 *
 * Every chunk that survives is passed on untouched, *including* the ones with no text (usage
 * totals, tool calls, the flush sentinel), so nothing else in the pipeline loses anything.
 */

import { MoodTagStripper, type Mood } from "@duke/core";
import { isChatChunk, withContent, type ReplyChunk } from "./reply-chunk";

export type { ReplyChunk };

export function stripMoodFromStream(
  stream: ReadableStream<ReplyChunk>,
  onMood: (mood: Mood) => void,
): ReadableStream<ReplyChunk> {
  const stripper = new MoodTagStripper();

  return stream.pipeThrough(
    new TransformStream<ReplyChunk, ReplyChunk>({
      transform(chunk, controller): void {
        // Plain text, which is what most providers stream.
        if (typeof chunk === "string") {
          const out = stripper.push(chunk);
          if (out.mood !== null) onMood(out.mood);
          if (out.text.length > 0) controller.enqueue(out.text);
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

        const out = stripper.push(content);
        if (out.mood !== null) onMood(out.mood);
        if (out.text.length === 0) return;

        controller.enqueue(withContent(chunk, out.text));
      },

      flush(controller): void {
        // Whatever is still held back — a reply that ended right after "[[sa" — is spoken.
        const rest = stripper.flush();
        if (rest.length > 0) controller.enqueue(rest);
      },
    }),
  );
}
