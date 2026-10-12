import { z } from "zod";
import { CHARACTER_LIMITS } from "@duke/core";

/**
 * The shape the Create Character screen sends.
 *
 * These limits match `CHARACTER_LIMITS` in `@duke/core`, so the browser gets the same
 * message whether zod rejects it or the domain rule trims it. The domain is still the
 * authority — this is the friendly early exit.
 */

export const characterDraftSchema = z.object({
  name: z.string().trim().min(1, "Give your friend a name.").max(CHARACTER_LIMITS.name),
  role: z.string().trim().min(1, 'Say what this friend is, e.g. "English teacher".').max(CHARACTER_LIMITS.role),
  personality: z.string().max(CHARACTER_LIMITS.personality).optional(),
  voiceId: z.string().max(64).optional(),
  accent: z.string().max(CHARACTER_LIMITS.accent).optional(),
  feedbackStyle: z.enum(["just-talk", "quiet-tips", "correct-aloud"]).optional(),
  savage: z.boolean().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  defaultTopic: z.string().max(CHARACTER_LIMITS.defaultTopic).nullable().optional(),
});

export type CharacterDraftBody = z.infer<typeof characterDraftSchema>;

export const notFoundProblem = (): { field: string; problem: string } => ({
  field: "id",
  problem: "That friend does not exist, or is not yours.",
});
