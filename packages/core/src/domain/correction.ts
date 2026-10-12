import type { CorrectionId, SessionId, TurnId } from "./ids";

/** "You said X, better is Y" — shown on the Session Detail screen. */
export interface Correction {
  readonly id: CorrectionId;
  readonly sessionId: SessionId;
  /** Null when the correction is about the call as a whole. */
  readonly turnId: TurnId | null;
  /** What the learner said. */
  readonly said: string;
  /** The corrected version. */
  readonly fixed: string;
  /** Short reason, e.g. "past tense". */
  readonly note: string | null;
}
