/**
 * Ears — Deepgram.
 *
 * Two ways in, because the product needs both:
 *
 *   - {@link DeepgramStt.transcribe} streams over a WebSocket. This is the `SpeechToText`
 *     port, and it is what the standalone "test the ears alone" script uses.
 *   - {@link DeepgramStt.transcribeRecording} posts a finished file to the REST endpoint.
 *
 * The live call path goes through LiveKit's own Deepgram plugin, which speaks the same
 * wire protocol; both are here so a failure can be narrowed to one side.
 *
 * Auth note: the browser WebSocket API cannot set an `Authorization` header, so Deepgram
 * accepts the key as a subprotocol — `new WebSocket(url, ["token", key])`. Node's global
 * `WebSocket` is what we use, so there is no `ws` dependency.
 */

import type { AudioChunk, SpeechToText, TranscriptEvent } from "@duke/core";
import { AppError, DEFAULT_DEEPGRAM_MODEL, optionalEnv, requireEnv } from "@duke/shared";
import { AsyncQueue } from "../internal/async-queue";

const DEFAULT_SAMPLE_RATE = 16_000;
const LISTEN_URL = "wss://api.deepgram.com/v1/listen";
const PRERECORDED_URL = "https://api.deepgram.com/v1/listen";

export interface DeepgramSttOptions {
  readonly apiKey?: string;
  readonly model?: string;
  /** Extra words Deepgram should expect, e.g. the character's name. */
  readonly keyterms?: readonly string[];
  readonly onError?: (error: unknown) => void;
}

interface DeepgramAlternative {
  readonly transcript?: string;
}

interface DeepgramResult {
  readonly is_final?: boolean;
  readonly speech_final?: boolean;
  readonly channel?: { readonly alternatives?: readonly DeepgramAlternative[] };
}

export class DeepgramStt implements SpeechToText {
  constructor(private readonly options: DeepgramSttOptions = {}) {}

  private apiKey(): string {
    return this.options.apiKey ?? requireEnv("DEEPGRAM_API_KEY");
  }

  private model(): string {
    return this.options.model ?? optionalEnv("DEEPGRAM_MODEL", DEFAULT_DEEPGRAM_MODEL);
  }

  /** Stream a live microphone. Yields interim and final transcripts. */
  async *transcribe(
    audio: AsyncIterable<AudioChunk>,
    options: { readonly language: string },
  ): AsyncIterable<TranscriptEvent> {
    const iterator = audio[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done) return;

    const url = new URL(LISTEN_URL);
    url.searchParams.set("model", this.model());
    url.searchParams.set("language", options.language);
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", String(first.value.sampleRate || DEFAULT_SAMPLE_RATE));
    url.searchParams.set("channels", "1");
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("punctuate", "true");
    url.searchParams.set("smart_format", "true");
    // 300ms of silence closes a sentence, which keeps replies snappy.
    url.searchParams.set("endpointing", "300");
    for (const keyterm of this.options.keyterms ?? []) {
      url.searchParams.append("keyterm", keyterm);
    }

    const socket = new WebSocket(url, ["token", this.apiKey()]);
    const queue = new AsyncQueue<TranscriptEvent>();

    const pump = async (): Promise<void> => {
      try {
        socket.send(first.value.pcm);
        for (;;) {
          const next = await iterator.next();
          if (next.done) break;
          socket.send(next.value.pcm);
        }
        // Polite close: lets Deepgram flush the last sentence before it hangs up.
        socket.send(JSON.stringify({ type: "CloseStream" }));
      } catch (error) {
        this.options.onError?.(error);
        queue.fail(error);
      }
    };

    socket.addEventListener("open", () => {
      void pump();
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      try {
        const payload = JSON.parse(String(event.data)) as DeepgramResult;
        const text = payload.channel?.alternatives?.[0]?.transcript ?? "";
        if (text.trim().length === 0) return;
        queue.push({
          text: text.trim(),
          isFinal: payload.is_final === true || payload.speech_final === true,
        });
      } catch (error) {
        this.options.onError?.(error);
      }
    });

    socket.addEventListener("error", () => {
      queue.fail(new AppError("STT_SOCKET", "Deepgram socket failed. Check DEEPGRAM_API_KEY."));
    });

    socket.addEventListener("close", () => {
      queue.close();
    });

    try {
      yield* queue;
    } finally {
      queue.close();
      // Stop the reader loop even if the consumer walked away early.
      void iterator.return?.();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
  }

  /**
   * Transcribe a finished recording in one shot. Used by the provider smoke test and by
   * anything that replays a saved clip.
   */
  async transcribeRecording(
    bytes: Uint8Array,
    options: { readonly language?: string; readonly contentType?: string } = {},
  ): Promise<string> {
    const url = new URL(PRERECORDED_URL);
    url.searchParams.set("model", this.model());
    url.searchParams.set("language", options.language ?? "en");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey()}`,
        "Content-Type": options.contentType ?? "audio/wav",
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new AppError(
        "STT_HTTP",
        `Deepgram returned ${response.status}. ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as DeepgramResult;
    return payload.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
  }

  /** Cheap key check for the doctor command. */
  async check(): Promise<void> {
    const response = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${this.apiKey()}` },
    });
    if (!response.ok) {
      throw new AppError("STT_AUTH", `Deepgram rejected the key (${response.status}).`);
    }
  }
}
