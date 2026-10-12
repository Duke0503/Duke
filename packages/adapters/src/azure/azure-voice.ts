/**
 * Voice — Azure Speech, with real emotion.
 *
 * This is the adapter that makes Duke sound like a person. The LLM opens every reply with a
 * `[[mood]]` tag; `MOOD_TO_STYLE` (in `@duke/core`) turns that into an Azure
 * `mstts:express-as` style, and this file wraps the sentence in that SSML.
 *
 * Which styles a given voice supports is the one thing this file cannot know in advance — and the
 * live service answers it in a way the code originally got wrong. Azure does **not** reject a style
 * a voice does not have: a request with `style="banana"` comes back `200` with audio, and so does a
 * real style that belongs to a different voice. An unsupported style is quietly ignored, so a voice
 * that cannot express a mood does not fail — it sounds flat, and nothing in the response says so.
 * What *does* return 400 is a voice **name** that does not exist, and with an empty body, so the
 * name has to come from us. Choosing voices that can do every mood is therefore `voice.ts`'s job,
 * and the second attempt in `speak` is only a net under the 400s that do happen.
 *
 * Output is `riff-24khz-16bit-mono-pcm`: uncompressed PCM inside a WAV header. Asking for
 * MP3 would mean shipping a decoder; asking for RIFF means the bytes after the 44-byte
 * header are already the samples we want.
 */

import { MOOD_TO_STYLE, type AudioChunk, type SpeakInput, type Voice, type VoiceStyle } from "@duke/core";
import { AppError, optionalEnv, requireEnv } from "@duke/shared";

const OUTPUT_FORMAT = "riff-24khz-16bit-mono-pcm";
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
/** 20ms of audio per frame: the size LiveKit's audio pipeline likes. */
const FRAME_SAMPLES = 480;
const FRAME_BYTES = FRAME_SAMPLES * 2 * CHANNELS;

export interface AzureVoiceOptions {
  readonly apiKey?: string;
  readonly region?: string;
  /** Fallback voice when a character has none. */
  readonly defaultVoiceId?: string;
  readonly onError?: (error: unknown) => void;
}

type SynthesisResult =
  | { readonly ok: true; readonly wav: Uint8Array }
  | { readonly ok: false; readonly status: number; readonly message: string };

const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const escapeXml = (text: string): string => text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);

/** Pull the samples out of a WAV, walking the RIFF chunks rather than trusting offset 44. */
export function extractPcm(wav: Uint8Array): Uint8Array {
  if (wav.length < 12) return wav;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id =
      String.fromCharCode(wav[offset] ?? 0) +
      String.fromCharCode(wav[offset + 1] ?? 0) +
      String.fromCharCode(wav[offset + 2] ?? 0) +
      String.fromCharCode(wav[offset + 3] ?? 0);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "data") {
      const end = Math.min(body + size, wav.length);
      return wav.subarray(body, end);
    }
    // Chunks are word-aligned: an odd size is followed by one pad byte.
    offset = body + size + (size % 2);
  }
  return wav;
}

/** Cut the samples into fixed frames, copied so the whole response can be released. */
export function* framePcm(pcm: Uint8Array, sampleRate = SAMPLE_RATE): Generator<AudioChunk> {
  for (let offset = 0; offset < pcm.length; offset += FRAME_BYTES) {
    const slice = pcm.subarray(offset, Math.min(offset + FRAME_BYTES, pcm.length));
    yield { pcm: new Uint8Array(slice), sampleRate };
  }
}

export function buildSsml(text: string, voiceId: string, style: VoiceStyle | null): string {
  const inner =
    style === null || style.style === null
      ? escapeXml(text)
      : `<mstts:express-as style="${style.style}" styledegree="${style.degree}">${escapeXml(text)}</mstts:express-as>`;

  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"`,
    ` xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">`,
    `<voice name="${voiceId}">${inner}</voice>`,
    `</speak>`,
  ].join("");
}

export class AzureVoice implements Voice {
  constructor(private readonly options: AzureVoiceOptions = {}) {}

  private apiKey(): string {
    return this.options.apiKey ?? requireEnv("AZURE_SPEECH_KEY");
  }

  private region(): string {
    return this.options.region ?? requireEnv("AZURE_SPEECH_REGION");
  }

  private defaultVoiceId(): string {
    return this.options.defaultVoiceId ?? optionalEnv("AZURE_VOICE", "en-US-AriaNeural");
  }

  private endpoint(): string {
    return `https://${this.region()}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }

  private async request(ssml: string): Promise<SynthesisResult> {
    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey(),
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "duke",
      },
      body: ssml,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: await response.text().catch(() => ""),
      };
    }
    return { ok: true, wav: new Uint8Array(await response.arrayBuffer()) };
  }

  async *speak(input: SpeakInput): AsyncIterable<AudioChunk> {
    const text = input.text.trim();
    if (text.length === 0) return;

    const voiceId = input.voiceId.trim().length > 0 ? input.voiceId : this.defaultVoiceId();
    const style = input.mood === null ? null : MOOD_TO_STYLE[input.mood];

    if (style !== null && style.style !== null) {
      const styled = await this.request(buildSsml(text, voiceId, style));
      if (styled.ok) {
        yield* framePcm(extractPcm(styled.wav));
        return;
      }
      if (styled.status !== 400) {
        // 401/403/429 are real problems; a second plain request would just fail again.
        throw new AppError(
          "VOICE_HTTP",
          `Azure speech returned ${styled.status} for voice "${voiceId}". ${styled.message}`.trim(),
        );
      }

      // A 400 is ambiguous — the style, or the voice name — and Azure's body is empty, so it will
      // not say which. Ask plainly before blaming the emotion: if the voice itself is wrong, that
      // request fails too, and the error below is the accurate one.
      const plain = await this.request(buildSsml(text, voiceId, null));
      if (!plain.ok) {
        throw new AppError(
          "VOICE_HTTP",
          `Azure speech returned ${plain.status} for voice "${voiceId}". ${plain.message}`.trim(),
        );
      }
      // The plain request worked, so the style was the reason the first one did not.
      this.options.onError?.(
        new AppError(
          "VOICE_STYLE_UNSUPPORTED",
          `Voice ${voiceId} rejected the "${style.style}" style; speaking plainly.`,
        ),
      );
      yield* framePcm(extractPcm(plain.wav));
      return;
    }

    const plain = await this.request(buildSsml(text, voiceId, null));
    if (!plain.ok) {
      throw new AppError(
        "VOICE_HTTP",
        `Azure speech returned ${plain.status} for voice "${voiceId}". ${plain.message}`.trim(),
      );
    }
    yield* framePcm(extractPcm(plain.wav));
  }

  /** Trim text to what one request can hold. Azure caps a single request well above this. */
  static readonly MAX_CHARS_PER_REQUEST = 2_000;

  /**
   * Ask Azure to list voices for this key — a real call, and the cheapest way to know that a key
   * and a region work together.
   *
   * The doctor deliberately does **not** call this: it promises never to claim a key is valid,
   * because a provider having a bad minute would then be reported as a setup mistake (see the note
   * at the top of `scripts/doctor.mjs`). This exists for a deliberate check by hand.
   */
  async check(): Promise<number> {
    const response = await fetch(
      `https://${this.region()}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { "Ocp-Apim-Subscription-Key": this.apiKey() } },
    );
    if (!response.ok) {
      throw new AppError("VOICE_AUTH", `Azure speech rejected the key (${response.status}).`);
    }
    const voices = (await response.json()) as unknown[];
    return voices.length;
  }
}
