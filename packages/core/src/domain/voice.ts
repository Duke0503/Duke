/**
 * Which Azure voice speaks which role.
 *
 * The user types a role as free text ("senior developer", "my old maths teacher"), so we
 * match keywords instead of demanding a fixed list. No match means the friendly default.
 *
 * Two strengths of keyword, because "friend" appears in half the roles people type:
 *   - `keywords`         define the role. A match is a strong signal.
 *   - `genericKeywords`  only point here when nothing stronger matched.
 * Without that split, "savage friend" scores 1 for *friend* and 1 for *savage*, and the
 * generic word wins on order alone.
 *
 * The voiceIds here are a starting guess and are **not** verified against Azure's live
 * voice list. `AzureVoice` treats an unknown voice as a hard error and says which name it
 * tried, so a wrong guess is a one-line fix rather than silent silence.
 */

export interface RoleVoice {
  readonly id: string;
  readonly label: string;
  readonly voiceId: string;
  /** Shown next to the label in the picker. */
  readonly feeling: string;
  /** Words that define this role (weight 2). */
  readonly keywords: readonly string[];
  /** Words that only mean this role when nothing else fits (weight 1). */
  readonly genericKeywords: readonly string[];
}

export const DEFAULT_VOICE_ID = "en-US-AriaNeural";

const STRONG = 2;
const GENERIC = 1;

export const ROLE_VOICES: readonly RoleVoice[] = [
  {
    id: "friend",
    label: "Friend",
    voiceId: DEFAULT_VOICE_ID,
    feeling: "warm, casual",
    keywords: [],
    genericKeywords: ["friend", "buddy", "mate", "companion", "casual", "chat", "default"],
  },
  {
    id: "teacher",
    label: "English teacher",
    voiceId: "en-US-JennyNeural",
    feeling: "clear, patient",
    keywords: ["teacher", "teach", "tutor", "lesson", "english", "coach", "professor", "class"],
    genericKeywords: [],
  },
  {
    id: "developer",
    label: "Senior developer",
    voiceId: "en-US-GuyNeural",
    feeling: "calm, confident",
    keywords: ["developer", "dev", "engineer", "programmer", "coder", "software", "code", "tech"],
    genericKeywords: [],
  },
  {
    id: "barista",
    label: "Coffee barista",
    voiceId: "en-US-JasonNeural",
    feeling: "young, friendly",
    keywords: ["barista", "coffee", "cafe", "café", "waiter", "waitress", "cashier"],
    genericKeywords: ["bar", "shop"],
  },
  {
    id: "interviewer",
    label: "Job interviewer",
    voiceId: "en-US-TonyNeural",
    feeling: "serious, formal",
    keywords: ["interview", "interviewer", "hr", "recruiter", "hiring"],
    genericKeywords: ["manager", "boss"],
  },
  {
    id: "savage",
    label: "Savage friend",
    voiceId: "en-US-DavisNeural",
    feeling: "funny, teasing",
    keywords: ["savage", "roast", "roasting", "teasing", "banter", "sarcastic"],
    genericKeywords: ["funny"],
  },
  {
    id: "british",
    label: "British friend",
    voiceId: "en-GB-RyanNeural",
    feeling: "native UK accent",
    keywords: ["british", "brit", "uk", "england", "london"],
    genericKeywords: ["accent"],
  },
];

const FRIEND = ROLE_VOICES[0] as RoleVoice;

/**
 * Pick the closest voice for a free-text role: "my old maths teacher" -> the teacher voice.
 * The role that scores highest wins, so "savage friend" beats the generic word *friend*,
 * and a two-word hit ("software engineer") beats a single one.
 */
export function voiceForRole(role: string): RoleVoice {
  const text = role.toLowerCase();
  if (text.trim().length === 0) return FRIEND;

  let best: RoleVoice | null = null;
  let bestScore = 0;

  for (const candidate of ROLE_VOICES) {
    let score = 0;
    for (const keyword of candidate.keywords) {
      if (text.includes(keyword)) score += keyword.includes(" ") ? STRONG + 1 : STRONG;
    }
    for (const keyword of candidate.genericKeywords) {
      if (text.includes(keyword)) score += GENERIC;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best ?? FRIEND;
}

export const isKnownVoice = (voiceId: string): boolean =>
  ROLE_VOICES.some((roleVoice) => roleVoice.voiceId === voiceId);

/** The list the Create Character screen renders, plus any custom voice already saved. */
export function voiceChoices(savedVoiceId?: string): readonly RoleVoice[] {
  if (savedVoiceId === undefined || isKnownVoice(savedVoiceId)) return ROLE_VOICES;
  return [
    ...ROLE_VOICES,
    {
      id: "custom",
      label: "Custom",
      voiceId: savedVoiceId,
      feeling: "set by you",
      keywords: [],
      genericKeywords: [],
    },
  ];
}

/**
 * A role is "savage" when the role text asks for the teasing voice. The UI also has an
 * explicit switch, which is what really decides — this is only the smart default when the
 * user types "savage friend" themselves.
 */
export function looksSavage(role: string): boolean {
  return voiceForRole(role).id === "savage";
}
