/**
 * Verb: end a call.
 *
 * Closing a call does two jobs. The cheap one is bookkeeping: stamp the end time and the
 * duration. The valuable one is the **one extra LLM call** that reads the transcript and
 * writes down what to remember — the topic, a one-line summary, the mistakes worth
 * revisiting, and the new words.
 *
 * That summariser runs once per call, on the cheapest model, over a capped transcript. It is
 * the only place in Duke that asks the model for structured output, and
 * `parseSessionSummary` is the only place that output is trusted.
 *
 * This must be safe to call twice: the browser closing the tab and the agent shutting down
 * both race to end the same session.
 */

import type { NewId } from "../domain/ids";
import { dominantMood } from "../domain/mood";
import { isEnded, type Session, type Turn } from "../domain/session";
import {
  type SessionSummary,
  parseSessionSummary,
  toCorrections,
  toVocabulary,
} from "../domain/session-summary";
import { buildSummaryPrompt, buildSummaryRetryPrompt } from "./build-prompt";
import type { Brain, Clock, SessionRepository } from "./ports";

/** The summariser's standing instruction. Deliberately boring. */
const SUMMARY_SYSTEM =
  "You are a careful English teacher. You read a practice call and report what happened. You always answer with JSON.";

export interface EndCallDeps {
  readonly sessions: SessionRepository;
  readonly brain: Brain;
  readonly clock: Clock;
  readonly newId: NewId;
}

export interface EndCallInput {
  readonly sessionId: string;
  /** Used only as the transcript label, e.g. "LEO:". */
  readonly characterName: string;
  /** Measured by the agent. Falls back to the wall clock between start and end. */
  readonly durationSec?: number;
  /** Set false to close the session without spending a summariser call. */
  readonly summarise?: boolean;
}

export interface EndCallOutcome {
  readonly session: Session;
  readonly summary: SessionSummary | null;
  readonly corrections: number;
  readonly newWords: number;
}

export type EndCallResult =
  | { readonly ok: true; readonly outcome: EndCallOutcome }
  | { readonly ok: false; readonly kind: "session-not-found"; readonly message: string };

/** Read a whole reply into one string, so the JSON parser sees all of it. */
async function collectReply(brain: Brain, system: string, userText: string): Promise<string> {
  let text = "";
  for await (const chunk of brain.reply({ system, history: [], userText })) {
    if (chunk.done) break;
    text += chunk.text;
  }
  return text;
}

async function summarise(
  brain: Brain,
  characterName: string,
  turns: readonly Turn[],
): Promise<SessionSummary | null> {
  const prompt = buildSummaryPrompt({ characterName, turns });

  // Two attempts, then give up. A missing summary is a slightly emptier next call; a
  // failed call-end is a lost session. Those are not worth trading.
  for (const attempt of [prompt, `${prompt}\n\n---\n${buildSummaryRetryPrompt()}`]) {
    const raw = await collectReply(brain, SUMMARY_SYSTEM, attempt);
    const parsed = parseSessionSummary(raw);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** The dominant mood of the character's lines — the mood tags the prompt asked for. */
const callMood = (turns: readonly Turn[]) =>
  dominantMood(
    turns.filter((turn) => turn.speaker === "character").map((turn) => turn.text),
  );

export async function endCall(deps: EndCallDeps, input: EndCallInput): Promise<EndCallResult> {
  const existing = await deps.sessions.getById(input.sessionId);
  if (existing === null) {
    return { ok: false, kind: "session-not-found", message: "No such call." };
  }

  // Already closed by the other caller. Report what is stored rather than re-summarising.
  if (isEnded(existing)) {
    return {
      ok: true,
      outcome: {
        session: existing,
        summary:
          existing.topic === null && existing.summary === null
            ? null
            : { topic: existing.topic ?? "", summary: existing.summary ?? "", mistakes: [], newWords: [] },
        corrections: 0,
        newWords: 0,
      },
    };
  }

  const turns = await deps.sessions.listTurns(existing.id);
  const endedAt = deps.clock.now();
  const durationSec =
    input.durationSec ??
    Math.max(0, Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000));

  let summary: SessionSummary | null = null;
  let corrections = 0;
  let newWords = 0;

  if (input.summarise !== false && turns.length > 0) {
    try {
      summary = await summarise(deps.brain, input.characterName, turns);
    } catch {
      // The call still ends. We just do not learn anything from it.
      summary = null;
    }

    if (summary !== null) {
      const correctionRows = toCorrections(existing.id, summary, deps.newId);
      const vocabularyRows = toVocabulary(existing.id, summary, deps.newId);
      await deps.sessions.saveCorrections(correctionRows);
      await deps.sessions.saveVocabulary(vocabularyRows);
      corrections = correctionRows.length;
      newWords = vocabularyRows.length;
    }
  }

  const session: Session = {
    ...existing,
    endedAt,
    durationSec,
    topic: summary !== null && summary.topic.length > 0 ? summary.topic : existing.topic,
    summary:
      summary !== null && summary.summary.length > 0 ? summary.summary : existing.summary,
    mood: summary !== null ? callMood(turns) : existing.mood,
  };
  await deps.sessions.save(session);

  return { ok: true, outcome: { session, summary, corrections, newWords } };
}
