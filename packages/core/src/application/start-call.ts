/**
 * Verb: start a call.
 *
 * This is the busiest use-case in Duke, and it exists so the API controller can stay a
 * one-liner. It does five things and they belong together:
 *
 *   1. checks the character belongs to this user,
 *   2. checks the monthly budget *before* opening a room,
 *   3. writes the session row,
 *   4. asks the transport for a room and a short-lived join token,
 *   5. leaves a **session brief** in Redis for the agent.
 *
 * Point 5 is the important one. The agent is a separate process and must not re-derive the
 * personality, the memory card or the voice — that would be a second implementation of the
 * prompt rules, and the two would drift. The API is the only writer of the brief.
 */

import type { Character } from "../domain/character";
import { type BudgetLevel, type BudgetLimits, DEFAULT_BUDGET_LIMITS, checkBudget } from "../domain/budget";
import type { NewId } from "../domain/ids";
import type { MemoryCard } from "../domain/memory-card";
import type { Session } from "../domain/session";
import { buildGreetingPrompt, buildSystemPrompt } from "./build-prompt";
import { SESSION_BRIEF_TTL_SECONDS, monthOf, sessionBriefKey, usageCounterKey } from "./keys";
import { rememberLastCall } from "./memory";
import type { Cache, CharacterRepository, Clock, SessionRepository, Transport } from "./ports";

export interface StartCallDeps {
  readonly characters: CharacterRepository;
  readonly sessions: SessionRepository;
  readonly transport: Transport;
  readonly cache: Cache;
  readonly clock: Clock;
  readonly newId: NewId;
  readonly budget?: BudgetLimits;
}

export interface StartCallInput {
  readonly userId: string;
  readonly characterId: string;
  /** Which LiveKit identity to hand the join token to, e.g. "phone-<deviceId>". */
  readonly identity: string;
  /** `false` starts fresh and ignores what was remembered last time. */
  readonly continueFromLast?: boolean;
}

/** What the agent reads before it says anything. */
export interface SessionBrief {
  readonly sessionId: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly voiceId: string;
  readonly accent: string;
  readonly savage: boolean;
  readonly feedbackStyle: Character["feedbackStyle"];
  readonly systemPrompt: string;
  readonly greetingPrompt: string;
  /** 1 = normal, below 1 = answer shorter because the budget is tight. */
  readonly replyScale: number;
}

export interface StartedCall {
  readonly session: Session;
  readonly character: Character;
  readonly roomId: string;
  readonly url: string;
  readonly token: string;
  readonly expiresInSeconds: number;
  readonly memoryCard: MemoryCard;
  readonly rememberedFromSessionId: string | null;
  readonly budgetLevel: BudgetLevel;
  readonly warning: string | null;
}

export type StartCallResult =
  | { readonly ok: true; readonly call: StartedCall }
  | {
      readonly ok: false;
      readonly kind: "character-not-found" | "budget-exceeded" | "transport";
      readonly message: string;
    };

export async function startCall(
  deps: StartCallDeps,
  input: StartCallInput,
): Promise<StartCallResult> {
  const character = await deps.characters.getById(input.characterId);
  if (character === null || character.userId !== input.userId) {
    return {
      ok: false,
      kind: "character-not-found",
      message: "That friend does not exist, or is not yours.",
    };
  }

  const limits = deps.budget ?? DEFAULT_BUDGET_LIMITS;
  const now = deps.clock.now();
  const month = monthOf(now);

  // Two tiny reads, not a blob: these are the same counters the agent increments.
  const [sttSec, ttsChars] = await Promise.all([
    deps.cache.get<number>(usageCounterKey(input.userId, month, "sttSec")),
    deps.cache.get<number>(usageCounterKey(input.userId, month, "ttsChars")),
  ]);

  const verdict = checkBudget(
    {
      livekitMinutes: (sttSec ?? 0) / 60,
      azureChars: ttsChars ?? 0,
      currentCallSeconds: 0,
    },
    limits,
  );

  if (verdict.level === "stop") {
    return {
      ok: false,
      kind: "budget-exceeded",
      message:
        verdict.reason ??
        "The free limit for this month is used up. Duke will work again next month.",
    };
  }

  const remembered =
    input.continueFromLast === false
      ? { card: { characterName: character.name, topic: null, summary: null, mistakes: [], newWords: [] }, fromSessionId: null }
      : await rememberLastCall({ sessions: deps.sessions }, character);

  const systemPrompt = buildSystemPrompt({
    character,
    memoryCard: remembered.card,
    replyScale: verdict.replyScale,
  });

  const session: Session = {
    id: deps.newId(),
    userId: input.userId,
    characterId: character.id,
    startedAt: now,
    endedAt: null,
    durationSec: 0,
    topic: null,
    summary: null,
    mood: null,
  };
  await deps.sessions.save(session);

  let credentials: { token: string; url: string };
  let roomId: string;
  try {
    roomId = `duke-${session.id}`;
    credentials = await deps.transport.createRoom(roomId, input.identity);
  } catch (error) {
    return {
      ok: false,
      kind: "transport",
      message: error instanceof Error ? error.message : "Could not open the call.",
    };
  }

  const brief: SessionBrief = {
    sessionId: session.id,
    characterId: character.id,
    characterName: character.name,
    voiceId: character.voiceId,
    accent: character.accent,
    savage: character.savage,
    feedbackStyle: character.feedbackStyle,
    systemPrompt,
    greetingPrompt: buildGreetingPrompt(character, remembered.fromSessionId !== null),
    replyScale: verdict.replyScale,
  };
  await deps.cache.set(sessionBriefKey(session.id), brief, SESSION_BRIEF_TTL_SECONDS);

  return {
    ok: true,
    call: {
      session,
      character,
      roomId,
      url: credentials.url,
      token: credentials.token,
      expiresInSeconds: 900,
      memoryCard: remembered.card,
      rememberedFromSessionId: remembered.fromSessionId,
      budgetLevel: verdict.level,
      warning: verdict.level === "warn" ? verdict.reason : null,
    },
  };
}
