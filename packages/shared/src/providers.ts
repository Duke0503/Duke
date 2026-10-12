/**
 * The provider settings that more than one process has to agree on.
 *
 * These are not secrets and not really configuration: they are the *default* value of a setting
 * that lives in `.env`, kept here because the same number was written down in two or three
 * places and drifted. That is not hypothetical either — the agent shipped `nova-2` while the
 * adapter, the key list and `.env.example` all said `nova-3`, and the day the two paths disagree
 * is the day one of them is quietly wrong.
 *
 * The `.env` value still wins. `optionalEnv("GROQ_MODEL", DEFAULT_GROQ_MODEL)` reads the file and
 * falls back to the constant, so a person can change the model without touching code.
 */

/**
 * The brain.
 *
 * `openai/gpt-oss-20b` is Groq's small open-weight model and the fastest thing on the list:
 * measured here at **466ms to the first token** on a realistic reply, against 812ms for the
 * 120b. On a phone call that difference is the whole illusion, and 20b followed the mood-tag
 * format and stayed in character on every probe.
 *
 * `openai/gpt-oss-120b` is the stronger model — better at nuance, corrections and long
 * personas — and is the one line change to make when replies feel too shallow. Both are
 * reasoning models, which is why {@link groqReasoningEffort} exists.
 *
 * (The model this used to default to, `llama-3.3-70b-versatile`, was retired: a request for it
 * is a 404, and the first real call would have failed at the brain.)
 */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/**
 * The ears.
 *
 * `nova-3` is Deepgram's current streaming model, and the one its own docs recommend for
 * real-time conversation.
 */
export const DEFAULT_DEEPGRAM_MODEL = "nova-3";

/** What Groq accepts. Not `minimal` or `none` — those are a 400, verified against the API. */
export type GroqReasoningEffort = "low" | "medium" | "high";

/**
 * How hard a Groq model should think before it answers.
 *
 * This is not a taste setting, it is a correctness one. `gpt-oss` reasons by default, the
 * reasoning is billed against `max_tokens` *before* the answer starts, and Duke asks for a short
 * reply. Measured against the live API with a realistic reply of `max_tokens: 200`:
 *
 *   - `gpt-oss-20b`, default effort: **empty content** — 197 reasoning deltas and no answer at
 *     all, which is the worst possible failure, because nothing errors and the line is silent;
 *   - `gpt-oss-120b`, default effort: `"[[warm]] I spent the afternoon"` — cut off mid-sentence
 *     by the token budget;
 *   - either model at `low`: a complete reply, first token in 466–812ms.
 *
 * The reasoning deltas also arrive in the stream (as `delta.reasoning`, a separate field the
 * SDKs drop) and would be spoken out loud if they were mistaken for text. Less of them is better
 * for its own reason too.
 *
 * Returns `undefined` for a model that does not take the parameter, because sending
 * `reasoning_effort` to a model that does not support it is a 400 — so this is a decision about
 * the model, not a constant.
 */
export function groqReasoningEffort(model: string): GroqReasoningEffort | undefined {
  return model.toLowerCase().includes("gpt-oss") ? "low" : undefined;
}
