/**
 * Savage mode = playful roasting of the *mistake*, never the person.
 *
 * The main guard is the prompt (see BuildPrompt). This is the second line of
 * defence: a cheap check on the model output. It is deliberately conservative —
 * a false positive just makes us rewrite a line, which is cheap.
 */

const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string }> = [
  { pattern: /\b(stupid|idiot|dumb|moron|imbecile)\b/i, reason: "insulting intelligence" },
  { pattern: /\b(ugly|fat|disgusting|gross)\b/i, reason: "attacking appearance" },
  { pattern: /\b(your (mother|father|mom|dad|family|kids|parents))\b/i, reason: "involving family" },
  { pattern: /\b(shut up|nobody likes you|no one likes you|you are worthless)\b/i, reason: "cruel put-down" },
  { pattern: /\b(hate you|i hate)\b/i, reason: "hostility" },
];

export type SavageCheck =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export function checkSavage(text: string): SavageCheck {
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(text)) return { allowed: false, reason: rule.reason };
  }
  return { allowed: true };
}

/** Safe reply used when a rewrite also fails the check. */
export const SAFE_FALLBACK_LINE = "Okay okay — let me try that again, that came out wrong.";
