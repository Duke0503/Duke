import { z } from "zod";

/**
 * The one form in Duke.
 *
 * Both fields are only checked for "is there something here" — the real answer to "is this the
 * right password" comes from `verifyPassword`, and telling someone that their password is the
 * wrong *shape* is only useful to whoever is guessing.
 */
export const loginSchema = z.object({
  username: z.string().min(1, "Type your username."),
  password: z.string().min(1, "Type your password."),
});

export type LoginBody = z.infer<typeof loginSchema>;
