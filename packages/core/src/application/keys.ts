/**
 * Redis key names, in one place.
 *
 * Written down so a key can be found later by grepping for its shape instead of guessing.
 * All keys are namespaced with `duke:` so a shared Redis stays readable.
 */

/** The prompt + voice the agent needs for one call. Written by the API, read by the agent. */
export const sessionBriefKey = (sessionId: string): string => `duke:session:${sessionId}:brief`;

/** Per-user per-month usage counters, read by the budget rules. */
export const usageKey = (userId: string, month: string): string => `duke:usage:${userId}:${month}`;

/** `YYYY-MM` for a date. */
export const monthOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** How long a session brief survives. Longer than any call, shorter than a stale one. */
export const SESSION_BRIEF_TTL_SECONDS = 6 * 60 * 60;

/** Usage counters roll over with the month, plus a day of slack for clock skew. */
export const USAGE_TTL_SECONDS = 32 * 24 * 60 * 60;
