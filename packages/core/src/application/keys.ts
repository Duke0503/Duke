/**
 * Redis key names, in one place.
 *
 * Written down so a key can be found later by grepping for its shape instead of guessing.
 * Everything is namespaced with `duke:` so a Redis shared with other projects stays readable.
 */

/** The prompt + voice the agent needs for one call. Written by the API, read by the agent. */
export const sessionBriefKey = (sessionId: string): string => `duke:session:${sessionId}:brief`;

/** What a call is being counted against. */
export type UsageKind = "sttSec" | "ttsChars" | "llmTokens";

/**
 * One counter per kind.
 *
 * Deliberately separate keys and not one JSON blob: `INCRBY` is atomic, so the API and the
 * agent can both add to the month's usage at the same moment without losing an increment or
 * needing a lock. A single blob would need read-modify-write and would quietly drop writes.
 */
export const usageCounterKey = (userId: string, month: string, kind: UsageKind): string =>
  `duke:usage:${userId}:${month}:${kind}`;

/** `YYYY-MM` for a date. */
export const monthOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** How long a session brief survives. Longer than any call, shorter than a stale one. */
export const SESSION_BRIEF_TTL_SECONDS = 6 * 60 * 60;

/** Usage counters roll over with the month, plus a day of slack for clock skew. */
export const USAGE_TTL_SECONDS = 32 * 24 * 60 * 60;
