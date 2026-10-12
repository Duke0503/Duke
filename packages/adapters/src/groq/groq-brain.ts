/**
 * Brain — Groq.
 *
 * Groq speaks the OpenAI chat-completions API, so this is a small SSE client rather than a
 * vendor SDK. That is on purpose: the whole brain contract is "a system prompt, some
 * history, a user line, a stream of text back", and we would rather see that plainly.
 *
 * The reply is expected to open with a `[[mood]]` tag. This adapter does NOT strip it —
 * that is a domain rule (`stripMoodTag` in `@duke/core`), and the agent applies it, so the
 * transcript we save keeps the mood the character chose.
 */

import type { Brain, BrainChunk, BrainInput } from "@duke/core";
import {
  AppError,
  DEFAULT_GROQ_MODEL,
  groqReasoningEffort,
  optionalEnv,
  requireEnv,
} from "@duke/shared";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqBrainOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** The turn the model is answering, shown as `user`. */
  readonly onError?: (error: unknown) => void;
}

interface StreamChoice {
  readonly delta?: { readonly content?: string | null };
}

interface StreamChunk {
  readonly choices?: readonly StreamChoice[];
}

/** Split an SSE body into `data:` payloads, one per line. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) yield line.slice("data:".length).trim();
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice("data:".length).trim();
  } finally {
    reader.releaseLock();
  }
}

export class GroqBrain implements Brain {
  constructor(private readonly options: GroqBrainOptions = {}) {}

  private apiKey(): string {
    return this.options.apiKey ?? requireEnv("GROQ_API_KEY");
  }

  private model(): string {
    return this.options.model ?? optionalEnv("GROQ_MODEL", DEFAULT_GROQ_MODEL);
  }

  /**
   * The body both calls send.
   *
   * The one subtle part: reasoning models must be told to think *little*. Duke asks for a short
   * reply, the reasoning is billed against `max_tokens` before the answer starts, and at the
   * default effort the answer is truncated or missing entirely. See {@link groqReasoningEffort}.
   */
  private body(model: string): Record<string, unknown> {
    const body: Record<string, unknown> = { model };

    const effort = groqReasoningEffort(model);
    if (effort !== undefined) body["reasoning_effort"] = effort;

    return body;
  }

  async *reply(input: BrainInput): AsyncIterable<BrainChunk> {
    const messages = [
      { role: "system", content: input.system },
      ...input.history.map((turn) => ({
        role: turn.speaker === "user" ? "user" : "assistant",
        content: turn.text,
      })),
      { role: "user", content: input.userText },
    ];

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...this.body(this.model()),
        messages,
        stream: true,
        temperature: this.options.temperature ?? 0.8,
        max_tokens: this.options.maxTokens ?? 200,
      }),
    });

    if (!response.ok || response.body === null) {
      throw new AppError(
        "BRAIN_HTTP",
        `Groq returned ${response.status}. ${await response.text().catch(() => "")}`.trim(),
      );
    }

    for await (const data of sseData(response.body)) {
      if (data.length === 0) continue;
      if (data === "[DONE]") break;
      try {
        const chunk = JSON.parse(data) as StreamChunk;
        const text = chunk.choices?.[0]?.delta?.content ?? "";
        if (text.length > 0) yield { text, done: false };
      } catch (error) {
        // A half-written chunk is not worth failing the call over.
        this.options.onError?.(error);
      }
    }

    yield { text: "", done: true };
  }

  /**
   * One-shot, no streaming. Used by the summariser, where we want the whole JSON object
   * before touching it anyway.
   */
  async complete(system: string, userText: string, maxTokens = 700): Promise<string> {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...this.body(this.model()),
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
        stream: false,
        // Summarising is a reading task, not a writing one.
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      throw new AppError(
        "BRAIN_HTTP",
        `Groq returned ${response.status}. ${await response.text().catch(() => "")}`.trim(),
      );
    }

    const payload = (await response.json()) as {
      readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
    };
    return payload.choices?.[0]?.message?.content ?? "";
  }
}
