/**
 * Azure Speech, as a LiveKit TTS plugin.
 *
 * The provider work is already done and tested elsewhere: `@duke/adapters`' `AzureVoice`
 * builds the SSML, turns the mood into an `mstts:express-as` style, retries plainly when the
 * voice cannot do that emotion, and cuts the WAV into 20ms frames. This file only reshapes
 * that into what LiveKit wants — a `tts.TTS` whose `synthesize()` returns a `ChunkedStream`.
 *
 * Azure is not a streaming provider, so `capabilities.streaming` is false and the framework
 * wraps us in a `StreamAdapter`: it splits the reply into sentences and calls `synthesize`
 * once per sentence. That is also where barge-in comes from, for free.
 *
 * The mood is not part of the text. The LLM opens every reply with `[[mood]]`; the agent's
 * `llmNode` strips it and calls `setMood` before the sentence reaches us, so the emotion and
 * the words always travel together.
 */

import { AudioByteStream, shortuuid, tts, type APIConnectOptions } from "@livekit/agents";
import type { Mood, Voice } from "@duke/core";

/**
 * The frame type, pulled out of the byte stream that makes it.
 *
 * `@livekit/rtc-node` is reachable from two places in this tree, and TypeScript treats the two
 * copies as unrelated types even though they are the same file. Taking the type from the
 * producer side means there is only ever one identity.
 */
type AudioFrame = ReturnType<AudioByteStream["write"]>[number];

/** Azure is asked for `riff-24khz-16bit-mono-pcm`, so this is not a choice. */
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
/** 20ms of audio per frame: the size LiveKit's audio pipeline likes. */
const FRAME_SAMPLES = 480;

export interface AzureTtsOptions {
  readonly voice: Voice;
  /** The character's voice, from the session brief. */
  readonly voiceId: string;
  readonly onError?: (error: unknown) => void;
}

export class AzureTts extends tts.TTS {
  label = "duke.AzureSpeech";

  private readonly voice: Voice;
  private readonly onError: (error: unknown) => void;
  private readonly controller = new AbortController();
  private voiceId: string;
  private mood: Mood | null = null;

  constructor(options: AzureTtsOptions) {
    super(SAMPLE_RATE, CHANNELS, { streaming: false });
    this.voice = options.voice;
    this.voiceId = options.voiceId;
    this.onError = options.onError ?? ((): void => {});
  }

  /** The character's voice. Set once per call, from the brief. */
  setVoice(voiceId: string): void {
    this.voiceId = voiceId;
  }

  /** The emotion of the sentence being spoken. `null` means the voice's own default. */
  setMood(mood: Mood | null): void {
    this.mood = mood;
  }

  synthesize(
    text: string,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal,
  ): AzureSpeechStream {
    // The voice and mood are read now, not when the sentence is spoken: the next reply may
    // already have changed them.
    return new AzureSpeechStream(this, text, this.voiceId, this.mood, connOptions, abortSignal);
  }

  /** One sentence at a time; the framework wraps us. Nothing pushes text into Azure. */
  stream(): tts.SynthesizeStream {
    throw new Error(
      "Azure Speech is not a streaming provider in Duke; the framework wraps it in a StreamAdapter.",
    );
  }

  /** Stop handing out frames. Also used on shutdown. */
  override async close(): Promise<void> {
    this.controller.abort();
  }

  /** Non-fatal provider trouble, e.g. a voice that refuses the emotion. */
  reportError(error: unknown): void {
    this.onError(error);
  }

  /** One sentence, as audio frames. */
  async *frames(text: string, voiceId: string, mood: Mood | null): AsyncGenerator<AudioFrame> {
    // The adapter already cuts the samples into 20ms frames; this just fills them in as the
    // frames LiveKit's audio graph wants.
    const byteStream = new AudioByteStream(SAMPLE_RATE, CHANNELS, FRAME_SAMPLES);
    for await (const chunk of this.voice.speak({ text, voiceId, mood })) {
      if (this.controller.signal.aborted) return;
      for (const frame of byteStream.write(chunk.pcm)) yield frame;
    }
    for (const frame of byteStream.flush()) yield frame;
  }
}

class AzureSpeechStream extends tts.ChunkedStream {
  label = "duke.AzureSpeechStream";

  constructor(
    private readonly azure: AzureTts,
    text: string,
    private readonly voiceId: string,
    private readonly mood: Mood | null,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal,
  ) {
    super(text, azure, connOptions, abortSignal);
  }

  protected override async run(): Promise<void> {
    const id = shortuuid();
    try {
      // The last frame carries `final`, so hold one back.
      let previous: AudioFrame | null = null;
      for await (const frame of this.azure.frames(this.inputText, this.voiceId, this.mood)) {
        if (previous !== null) {
          this.queue.put({ requestId: id, segmentId: id, frame: previous, final: false });
        }
        previous = frame;
      }
      if (previous !== null) {
        this.queue.put({ requestId: id, segmentId: id, frame: previous, final: true });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      this.azure.reportError(error);
      throw error;
    } finally {
      this.queue.close();
    }
  }
}
