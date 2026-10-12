import type { CharacterId, UserId } from "./ids";

/** How much the character corrects the learner. */
export const FEEDBACK_STYLES = ["just-talk", "quiet-tips", "correct-aloud"] as const;

export type FeedbackStyle = (typeof FEEDBACK_STYLES)[number];

export function isFeedbackStyle(value: string): value is FeedbackStyle {
  return (FEEDBACK_STYLES as readonly string[]).includes(value);
}

/** Friendly labels for the UI and the prompt. */
export const FEEDBACK_STYLE_LABELS: Readonly<Record<FeedbackStyle, string>> = {
  "just-talk": "Just talk",
  "quiet-tips": "Quiet tips",
  "correct-aloud": "Correct out loud",
};

/** A named AI friend the user created. */
export interface Character {
  readonly id: CharacterId;
  readonly userId: UserId;
  /** What the user calls them, e.g. "Leo". */
  readonly name: string;
  /** Free text, e.g. "senior developer". */
  readonly role: string;
  /** Free text personality notes. */
  readonly personality: string;
  /** Azure voice name, e.g. "en-US-AriaNeural". */
  readonly voiceId: string;
  readonly accent: string;
  readonly feedbackStyle: FeedbackStyle;
  /**
   * Playful roasting on/off. When true the prompt allows teasing the *mistake*,
   * and the SavageGuard rule is enforced on the way out. Never real insults.
   */
  readonly savage: boolean;
  readonly avatarUrl: string | null;
  readonly defaultTopic: string | null;
  readonly createdAt: Date;
}

export function isSavage(character: Character): boolean {
  return character.savage === true;
}
