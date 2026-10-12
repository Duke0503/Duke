/**
 * Writing the call down.
 *
 * Two different things come out of one conversation, and they go to two different places:
 *
 *   - the **transcript** goes to Postgres, one row per turn, so History and Session Detail
 *     have something to show;
 *   - the **usage** goes to Redis counters, one `INCRBY` per kind, so the budget can be
 *     checked from the API without reading a table.
 *
 * Nothing here is allowed to break a call. A failed write is logged and dropped: a missing
 * transcript line is annoying, a call that dies mid-sentence is not.
 *
 * `record` and `addTokens` do not return a promise on purpose — they are called from LiveKit's
 * event handlers, which do not wait. The writes are kept in `pending` so `flush` can wait for
 * them before the process goes away.
 */

import { monthOf, usageCounterKey, USAGE_TTL_SECONDS } from "@duke/core";
import type { Cache, Clock, SessionRepository, Speaker, Turn } from "@duke/core";
import { newId } from "@duke/adapters";

export interface TurnRecorderOptions {
  readonly sessions: SessionRepository;
  readonly cache: Cache;
  readonly clock: Clock;
  readonly userId: string;
  readonly sessionId: string;
  readonly onError: (error: unknown) => void;
}

export class TurnRecorder {
  /** Position in the call, starting at 0 — the order of `turns.index`. */
  private index = 0;
  /** Characters we asked Azure to say. Azure bills per character. */
  private spokenChars = 0;
  /** Tokens the LLM reported. Informational; the budget leans on the other two. */
  private tokens = 0;
  private pending: Promise<void>[] = [];

  constructor(private readonly options: TurnRecorderOptions) {}

  /** Save one thing that was said. Safe to call for every turn, including empty ones. */
  record(speaker: Speaker, text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    if (speaker === "character") this.spokenChars += trimmed.length;

    const turn: Turn = {
      id: newId(),
      sessionId: this.options.sessionId,
      // Claimed now, so the order is the order they were said in even if the inserts finish
      // out of order.
      index: this.index++,
      speaker,
      text: trimmed,
      createdAt: this.options.clock.now(),
    };

    this.pending.push(
      this.options.sessions.appendTurn(turn).catch((error: unknown) => {
        this.options.onError(error);
      }),
    );
  }

  /** Add what one LLM call cost. */
  addTokens(tokens: number): void {
    if (Number.isFinite(tokens) && tokens > 0) this.tokens += Math.round(tokens);
  }

  /**
   * Wait for the transcript, then push this call's usage into the month's counters.
   *
   * Called once, when the call ends. One write per kind per call instead of one per sentence,
   * and a call that is cut off still leaves whatever was already counted in place.
   */
  async flush(): Promise<void> {
    await Promise.allSettled(this.pending);
    this.pending = [];

    const month = monthOf(this.options.clock.now());
    const writes: Promise<unknown>[] = [];

    if (this.spokenChars > 0) {
      writes.push(
        this.options.cache.increment(
          usageCounterKey(this.options.userId, month, "ttsChars"),
          this.spokenChars,
          USAGE_TTL_SECONDS,
        ),
      );
    }
    if (this.tokens > 0) {
      writes.push(
        this.options.cache.increment(
          usageCounterKey(this.options.userId, month, "llmTokens"),
          this.tokens,
          USAGE_TTL_SECONDS,
        ),
      );
    }

    try {
      await Promise.all(writes);
    } catch (error) {
      this.options.onError(error);
    }
  }
}
