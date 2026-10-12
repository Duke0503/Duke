/**
 * How much of the free month is gone.
 *
 * Duke runs on free tiers, and the free tiers are the thing most likely to break the app for
 * a real user: when LiveKit minutes or Azure characters run out, calls start failing inside the
 * voice loop where the error is hard to see. So the numbers are read *before* a call starts
 * (`startCall`) and shown on the Settings screen from here.
 *
 * The counters are three separate Redis integers, not one JSON blob, because `INCRBY` is
 * atomic: this process and the voice agent can both add to the same month at the same moment
 * and neither increment is lost. See `usageCounterKey` in `@duke/core`.
 *
 * Two things are worth knowing about the units:
 *
 *   - `sttSec` stands in for **LiveKit minutes**. LiveKit bills by the minute and a call is
 *     almost entirely speech, so the call's length is the honest proxy. `checkBudget` divides
 *     it by 60.
 *   - `llmTokens` has no cap yet — the Groq tier we use is free — but it is counted anyway so
 *     the number is visible and a real limit can be added in one place later.
 */

import { Inject, Injectable } from "@nestjs/common";
import {
  DEFAULT_BUDGET_LIMITS,
  USAGE_TTL_SECONDS,
  checkBudget,
  monthOf,
  usageCounterKey,
  type BudgetLevel,
  type Cache,
  type Clock,
  type UsageKind,
} from "@duke/core";
import { CACHE, CLOCK } from "../platform/tokens";

/** One bar on the Settings screen. */
export interface UsageMeterView {
  readonly kind: UsageKind;
  /** Friendly name, e.g. "Call minutes". */
  readonly label: string;
  readonly used: number;
  /** Null when nothing caps this counter. */
  readonly limit: number | null;
  readonly unit: string;
  /** `used / limit`, clamped to 0..1. Null when there is no limit. */
  readonly fraction: number | null;
}

export interface UsageView {
  readonly month: string;
  readonly level: BudgetLevel;
  readonly reason: string | null;
  /** 1 = normal, below 1 = Duke answers shorter to save the budget. */
  readonly replyScale: number;
  readonly meters: readonly UsageMeterView[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const meter = (
  kind: UsageKind,
  label: string,
  used: number,
  limit: number | null,
  unit: string,
): UsageMeterView => ({
  kind,
  label,
  used: round2(used),
  limit,
  unit,
  fraction: limit === null || limit <= 0 ? null : Math.min(1, Math.max(0, used / limit)),
});

@Injectable()
export class UsageService {
  constructor(
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The current `YYYY-MM`, from the clock so tests can travel in time. */
  private month(): string {
    return monthOf(this.clock.now());
  }

  /** Read all three counters for a month. A missing key is zero, not an error. */
  private async counters(
    userId: string,
    month: string,
  ): Promise<Record<UsageKind, number>> {
    const [sttSec, ttsChars, llmTokens] = await Promise.all([
      this.cache.get<number>(usageCounterKey(userId, month, "sttSec")),
      this.cache.get<number>(usageCounterKey(userId, month, "ttsChars")),
      this.cache.get<number>(usageCounterKey(userId, month, "llmTokens")),
    ]);
    return { sttSec: sttSec ?? 0, ttsChars: ttsChars ?? 0, llmTokens: llmTokens ?? 0 };
  }

  /**
   * Count a finished call against the month.
   *
   * Called once when a call ends, on top of whatever the agent already added. Rounds to whole
   * seconds and ignores nonsense, so a stray negative cannot wind the meter backwards.
   */
  async addCallSeconds(userId: string, seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    await this.cache.increment(
      usageCounterKey(userId, this.month(), "sttSec"),
      Math.round(seconds),
      USAGE_TTL_SECONDS,
    );
  }

  /** What the Settings screen shows: this month's meters, and how worried to be. */
  async snapshot(userId: string): Promise<UsageView> {
    const month = this.month();
    const limits = DEFAULT_BUDGET_LIMITS;
    const counters = await this.counters(userId, month);

    const verdict = checkBudget(
      {
        livekitMinutes: counters.sttSec / 60,
        azureChars: counters.ttsChars,
        currentCallSeconds: 0,
      },
      limits,
    );

    return {
      month,
      level: verdict.level,
      reason: verdict.reason,
      replyScale: verdict.replyScale,
      meters: [
        meter("sttSec", "Call minutes", counters.sttSec / 60, limits.livekitMinutes, "min"),
        meter("ttsChars", "Voice characters", counters.ttsChars, limits.azureChars, "chars"),
        meter("llmTokens", "Words thought", counters.llmTokens, null, "tokens"),
      ],
    };
  }
}
