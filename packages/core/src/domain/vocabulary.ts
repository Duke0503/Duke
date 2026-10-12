import type { SessionId, VocabularyId } from "./ids";

/** A new word met during a call. */
export interface VocabularyItem {
  readonly id: VocabularyId;
  readonly sessionId: SessionId;
  readonly word: string;
  readonly meaning: string;
}
