import { z } from "zod";

/** Start a call with one friend. */
export const startCallSchema = z.object({
  characterId: z.string().min(1, "Which friend should answer?"),
  /**
   * `true` (the default) loads what was remembered from the last call. The call screen's
   * "Start fresh" toggle sends `false`.
   */
  continueFromLast: z.boolean().optional(),
});

/** Close a call. Everything is optional so a simple "hang up" works with no body at all. */
export const endCallSchema = z
  .object({
    durationSec: z.number().int().min(0).max(24 * 60 * 60).optional(),
    summarise: z.boolean().optional(),
  })
  .optional();

export type StartCallBody = z.infer<typeof startCallSchema>;
export type EndCallBody = z.infer<typeof endCallSchema>;
