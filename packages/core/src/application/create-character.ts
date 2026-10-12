/**
 * Verb: create a character.
 *
 * A "character" is the friend the learner talks to. The screen collects a handful of text
 * boxes; this decides what is acceptable, fills in what the user did not choose, and hands
 * back a complete entity.
 *
 * The voice is picked from the role text when the user did not pick one — typing "savage
 * friend" should sound savage without a second decision.
 */

import { type Character, type FeedbackStyle, isFeedbackStyle } from "../domain/character";
import type { Clock } from "../application/ports";
import type { NewId } from "../domain/ids";
import { looksSavage, voiceForRole } from "../domain/voice";
import { cleanText, invalid, valid, type FieldProblem, type Validated } from "./validated";

export const CHARACTER_LIMITS = {
  name: 40,
  role: 80,
  personality: 400,
  accent: 40,
  defaultTopic: 120,
} as const;

export interface CharacterDraft {
  readonly name: string;
  readonly role: string;
  readonly personality?: string;
  /** Azure voice name. Left out, it follows the role. */
  readonly voiceId?: string;
  readonly accent?: string;
  readonly feedbackStyle?: string;
  readonly savage?: boolean;
  readonly avatarUrl?: string | null;
  readonly defaultTopic?: string | null;
}

export interface CharacterDeps {
  readonly clock: Clock;
  readonly newId: NewId;
}

const DEFAULT_FEEDBACK_STYLE: FeedbackStyle = "quiet-tips";

export function createCharacter(
  userId: string,
  draft: CharacterDraft,
  deps: CharacterDeps,
): Validated<Character> {
  const problems: FieldProblem[] = [];

  const name = cleanText(draft.name ?? "", CHARACTER_LIMITS.name);
  if (name.length === 0) {
    problems.push({ field: "name", problem: "Give your friend a name." });
  }

  const role = cleanText(draft.role ?? "", CHARACTER_LIMITS.role);
  if (role.length === 0) {
    problems.push({ field: "role", problem: "Say what this friend is, e.g. \"English teacher\"." });
  }

  const rawFeedback = draft.feedbackStyle ?? DEFAULT_FEEDBACK_STYLE;
  if (!isFeedbackStyle(rawFeedback)) {
    problems.push({
      field: "feedbackStyle",
      problem: 'Pick one of "just-talk", "quiet-tips" or "correct-aloud".',
    });
  }

  if (problems.length > 0) return invalid<Character>(...problems);

  const accent = cleanText(draft.accent ?? "", CHARACTER_LIMITS.accent);
  const chosenVoice = cleanText(draft.voiceId ?? "", 64);
  // No voice chosen: follow the role the user typed.
  const voiceId = chosenVoice.length > 0 ? chosenVoice : voiceForRole(role).voiceId;

  // The switch is what the user set; the role text is the smart default.
  const savage = draft.savage ?? looksSavage(role);

  return valid<Character>({
    id: deps.newId(),
    userId,
    name,
    role,
    personality: cleanText(draft.personality ?? "", CHARACTER_LIMITS.personality),
    voiceId,
    accent,
    feedbackStyle: rawFeedback as FeedbackStyle,
    savage,
    avatarUrl: draft.avatarUrl ?? null,
    defaultTopic:
      draft.defaultTopic === null || draft.defaultTopic === undefined
        ? null
        : cleanText(draft.defaultTopic, CHARACTER_LIMITS.defaultTopic) || null,
    createdAt: deps.clock.now(),
  });
}

/** Verb: edit an existing character. Same rules, same derived voice, id kept. */
export function updateCharacter(
  existing: Character,
  draft: CharacterDraft,
  deps: CharacterDeps,
): Validated<Character> {
  const result = createCharacter(existing.userId, draft, deps);
  if (!result.ok) return result;
  return valid<Character>({ ...result.value, id: existing.id, createdAt: existing.createdAt });
}
