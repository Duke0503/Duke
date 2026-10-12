/**
 * Never cross into a paid tier by accident.
 *
 * Free limits we are protecting: LiveKit 1,000 min/month, Azure 500k chars/month.
 */

export interface BudgetLimits {
  readonly livekitMinutes: number;
  readonly azureChars: number;
  /** Hard cap on a single call, to stop a runaway session. */
  readonly callMinutes: number;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  livekitMinutes: 1000,
  azureChars: 500_000,
  callMinutes: 30,
};

/** Fraction of a limit at which we start degrading instead of blocking. */
export const WARN_AT = 0.9;

export interface UsageSnapshot {
  readonly livekitMinutes: number;
  readonly azureChars: number;
  readonly currentCallSeconds: number;
}

export type BudgetLevel = "ok" | "warn" | "stop";

export interface BudgetVerdict {
  readonly level: BudgetLevel;
  readonly reason: string | null;
  /** Reply length multiplier: 1 = normal, below 1 = answer shorter. */
  readonly replyScale: number;
}

export function checkBudget(
  usage: UsageSnapshot,
  limits: BudgetLimits = DEFAULT_BUDGET_LIMITS,
): BudgetVerdict {
  const callMinutes = usage.currentCallSeconds / 60;

  if (callMinutes >= limits.callMinutes) {
    return { level: "stop", reason: "This call reached its time limit.", replyScale: 0 };
  }
  if (usage.livekitMinutes >= limits.livekitMinutes) {
    return { level: "stop", reason: "Monthly call minutes are used up.", replyScale: 0 };
  }
  if (usage.azureChars >= limits.azureChars) {
    return { level: "stop", reason: "Monthly voice characters are used up.", replyScale: 0 };
  }
  if (
    usage.livekitMinutes >= limits.livekitMinutes * WARN_AT ||
    usage.azureChars >= limits.azureChars * WARN_AT
  ) {
    return { level: "warn", reason: "Getting close to the monthly limit.", replyScale: 0.6 };
  }
  return { level: "ok", reason: null, replyScale: 1 };
}
