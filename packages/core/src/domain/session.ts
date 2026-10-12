import type { CharacterId, SessionId, TurnId, UserId } from "./ids";
import type { Mood } from "./mood";

export type Speaker = "user" | "character";

/** One thing said during a call. */
export interface Turn {
  readonly id: TurnId;
  readonly sessionId: SessionId;
  /** Position in the call, starting at 0. */
  readonly index: number;
  readonly speaker: Speaker;
  readonly text: string;
  readonly createdAt: Date;
}

/** One phone call. */
export interface Session {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly characterId: CharacterId;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly durationSec: number;
  readonly topic: string | null;
  readonly summary: string | null;
  /** Dominant mood of the call. */
  readonly mood: Mood | null;
}

export const isEnded = (session: Session): boolean => session.endedAt !== null;
