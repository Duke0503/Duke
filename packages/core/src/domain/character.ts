import type { CharacterId, UserId } from "./ids";

/** How much the character corrects the learner. */
export const FEEDBACK_STYLES = ["just-talk", "quiet-tips", "correct-aloud"] as const;

export type FeedbackStyle = (typeof FEEDBACK_STYLES)[number];

export function isFeedbackStyle(value: string): value is FeedbackStyle {
  return (FEEDBACK_STYLES as readonly string[]).includes(value);
}

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
  readonly avatarUrl: string | null;
  readonly defaultTopic: string | null;
  readonly createdAt: Date;
}
