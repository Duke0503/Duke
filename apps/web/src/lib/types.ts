/**
 * What the API sends back, from the browser's side.
 *
 * These mirror the view types in `apps/api` (`*View` in each service) rather than the domain
 * types in `@duke/core`. The two differ on purpose: the domain uses `Date`, the wire uses
 * ISO strings; the domain knows nothing about what a screen needs. Anything personal is also
 * `string` here instead of a branded id, because the browser only ever passes them back.
 */

import type { FeedbackStyle, MemoryCard, Mood, Speaker } from "@duke/core";

export interface Character {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly personality: string;
  readonly voiceId: string;
  readonly accent: string;
  readonly feedbackStyle: FeedbackStyle;
  readonly savage: boolean;
  readonly avatarUrl: string | null;
  readonly defaultTopic: string | null;
  readonly createdAt: string;
}

/** The body the Create Character screen sends. */
export interface CharacterDraft {
  readonly name: string;
  readonly role: string;
  readonly personality?: string;
  readonly voiceId?: string;
  readonly accent?: string;
  readonly feedbackStyle?: FeedbackStyle;
  readonly savage?: boolean;
  readonly avatarUrl?: string | null;
  readonly defaultTopic?: string | null;
}

export interface RememberedCard {
  readonly card: MemoryCard;
  readonly fromSessionId: string | null;
  readonly fromSessionStartedAt: string | null;
}

export interface StartedCall {
  readonly sessionId: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly roomId: string;
  readonly url: string;
  readonly token: string;
  readonly expiresInSeconds: number;
  readonly memoryCard: MemoryCard;
  readonly rememberedFromSessionId: string | null;
  readonly warning: string | null;
}

export interface EndedCall {
  readonly sessionId: string;
  readonly endedAt: string;
  readonly durationSec: number;
  readonly topic: string | null;
  readonly summary: string | null;
  readonly mood: string | null;
  readonly corrections: number;
  readonly newWords: number;
}

export interface SessionListItem {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSec: number;
  readonly topic: string | null;
  readonly summary: string | null;
  readonly mood: string | null;
  readonly open: boolean;
}

export interface SessionTurn {
  readonly id: string;
  readonly index: number;
  readonly speaker: Speaker;
  readonly text: string;
  readonly at: string;
}

export interface SessionDetail {
  readonly session: SessionListItem;
  readonly character: { id: string; name: string; role: string; avatarUrl: string | null } | null;
  readonly turns: readonly SessionTurn[];
  readonly corrections: readonly {
    readonly id: string;
    readonly said: string;
    readonly fixed: string;
    readonly note: string | null;
  }[];
  readonly vocabulary: readonly { readonly id: string; readonly word: string; readonly meaning: string }[];
}

export interface UsageMeter {
  readonly kind: "sttSec" | "ttsChars" | "llmTokens";
  readonly label: string;
  readonly used: number;
  readonly limit: number | null;
  readonly unit: string;
  readonly fraction: number | null;
}

export interface Usage {
  readonly month: string;
  readonly level: "ok" | "warn" | "stop";
  readonly reason: string | null;
  readonly replyScale: number;
  readonly meters: readonly UsageMeter[];
}

export interface KeyStatus {
  readonly key: string;
  readonly label: string;
  readonly where: string;
  readonly example: string | null;
  readonly secret: boolean;
  readonly optional: boolean;
  readonly set: boolean;
  readonly placeholder: boolean;
  readonly value: string | null;
}

export interface SetupGroup {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly url: string;
  readonly complete: boolean;
  readonly keys: readonly KeyStatus[];
}

export interface Setup {
  readonly ready: boolean;
  readonly summary: string;
  readonly requiredCount: number;
  readonly missing: readonly string[];
  readonly placeholders: readonly string[];
  readonly groups: readonly SetupGroup[];
}

/** Re-exported so screens can talk about moods without importing core themselves. */
export type { Character as CharacterView, Mood };
