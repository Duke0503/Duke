import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureVoice, buildSsml, extractPcm, framePcm } from "../azure/azure-voice";
import { MOOD_TO_STYLE, type Mood } from "@duke/core";

/** A minimal but real WAV: RIFF header, `fmt ` chunk, then `data`. */
function wav(samples: number[], { extraChunk = false } = {}): Uint8Array {
  const dataSize = samples.length * 2;
  const chunks: number[] = [];

  if (extraChunk) {
    // An odd-sized chunk, to prove the pad byte is handled.
    const body = [1, 2, 3];
    chunks.push(...[0x4a, 0x55, 0x4e, 0x4b], ...le32(3), ...body, 0);
  }
  chunks.push(...[0x64, 0x61, 0x74, 0x61], ...le32(dataSize));
  for (const sample of samples) chunks.push(...le16(sample));

  const bytes = new Uint8Array([
    ...[0x52, 0x49, 0x46, 0x46],
    ...le32(4 + 8 + 16 + chunks.length),
    ...[0x57, 0x41, 0x56, 0x45],
    ...[0x66, 0x6d, 0x74, 0x20],
    ...le32(16),
    ...le16(1),
    ...le16(1),
    ...le32(24_000),
    ...le32(24_000 * 2),
    ...le16(2),
    ...le16(16),
    ...chunks,
  ]);
  return bytes;
}

const le16 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff];
const le32 = (value: number): number[] => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >> 24) & 0xff,
];

describe("extractPcm", () => {
  it("returns the samples, not the header", () => {
    const pcm = extractPcm(wav([10, 20, 30]));
    expect(pcm.length).toBe(6);
    expect(pcm[0]).toBe(10);
    expect(pcm[1]).toBe(0);
    expect(pcm[2]).toBe(20);
  });

  it("walks past other chunks instead of assuming 44 bytes", () => {
    const pcm = extractPcm(wav([7, 8], { extraChunk: true }));
    expect(pcm.length).toBe(4);
    expect(pcm[0]).toBe(7);
  });

  it("passes raw bytes through when there is no RIFF header", () => {
    const raw = new Uint8Array([1, 2, 3]);
    expect(Array.from(extractPcm(raw))).toEqual([1, 2, 3]);
  });
});

describe("framePcm", () => {
  it("cuts audio into 20ms frames", () => {
    const pcm = new Uint8Array(960 * 2 + 100);
    const frames = Array.from(framePcm(pcm));
    expect(frames).toHaveLength(3);
    expect(frames[0]?.pcm.length).toBe(960);
    expect(frames[0]?.sampleRate).toBe(24_000);
    // The last frame is short but still delivered — never dropped.
    expect(frames[2]?.pcm.length).toBe(100);
  });

  it("copies each frame so the response buffer can be released", () => {
    const pcm = new Uint8Array(1920);
    const frames = Array.from(framePcm(pcm));
    expect(frames[0]?.pcm.buffer).not.toBe(pcm.buffer);
  });
});

describe("buildSsml", () => {
  it("wraps the sentence in the voice", () => {
    const ssml = buildSsml("hello", "en-US-AriaNeural", null);
    expect(ssml).toContain('<voice name="en-US-AriaNeural">hello</voice>');
    expect(ssml).not.toContain("express-as");
  });

  it("adds the emotion when there is one", () => {
    const ssml = buildSsml("hello", "en-US-AriaNeural", MOOD_TO_STYLE.cheerful);
    expect(ssml).toContain('<mstts:express-as style="cheerful" styledegree="1.2">hello</mstts:express-as>');
    expect(ssml).toContain('xmlns:mstts="https://www.w3.org/2001/mstts"');
  });

  it("speaks plainly for moods that have no Azure style", () => {
    // "calm" maps to a null style: the map exists so callers never special-case it.
    expect(buildSsml("hello", "en-US-AriaNeural", MOOD_TO_STYLE.calm)).not.toContain("express-as");
  });

  it("escapes text so a stray ampersand cannot break the request", () => {
    const ssml = buildSsml('Tom & Jerry say "hi" <now>', "en-US-AriaNeural", null);
    expect(ssml).toContain("Tom &amp; Jerry say &quot;hi&quot; &lt;now&gt;");
  });
});

/**
 * `speak` is the part that talks to Azure, and it had no tests — which is why two comments in the
 * file survived saying a wrong thing about how Azure answers. These are the behaviours that were
 * measured against the live service, pinned so they cannot drift back.
 */
describe("speak", () => {
  const audio = () => new Response(wav([1, 2, 3, 4, 5, 6, 7, 8]), { status: 200 });
  const refusal = (status: number, body = "") => new Response(body, { status });

  const voiceWith = (complaints: unknown[]) =>
    new AzureVoice({
      apiKey: "key",
      region: "region",
      onError: (error) => complaints.push(error),
    });

  const collect = async (
    voice: AzureVoice,
    mood: Mood,
    voiceId = "en-US-AriaNeural",
  ): Promise<number> => {
    let frames = 0;
    for await (const chunk of voice.speak({ text: "hello there", voiceId, mood })) {
      frames += chunk.pcm.length > 0 ? 1 : 0;
    }
    return frames;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks once when the voice can do the mood", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      return audio();
    });
    const complaints: unknown[] = [];

    const frames = await collect(voiceWith(complaints), "cheerful");

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('style="cheerful"');
    expect(complaints).toHaveLength(0);
    expect(frames).toBeGreaterThan(0);
  });

  it("speaks plainly and says so when Azure refuses the style", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      return bodies.length === 1 ? refusal(400) : audio();
    });
    const complaints: { code?: string }[] = [];

    const frames = await collect(voiceWith(complaints), "cheerful");

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toContain("express-as");
    expect(complaints[0]?.code).toBe("VOICE_STYLE_UNSUPPORTED");
    expect(frames).toBeGreaterThan(0);
  });

  it("blames the voice name, not the emotion, when the voice is the problem", async () => {
    // Azure 400s an unknown voice with an empty body, so this is the only way to learn the name.
    vi.stubGlobal("fetch", async () => refusal(400));
    const complaints: unknown[] = [];

    await expect(collect(voiceWith(complaints), "cheerful", "en-US-NotAVoiceNeural")).rejects.toThrow(
      /en-US-NotAVoiceNeural/,
    );
    // The old code reported "rejected the style" first, which sent the reader to the wrong file.
    expect(complaints).toHaveLength(0);
  });

  it("does not retry a provider failure", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return refusal(401, "denied");
    });

    await expect(collect(voiceWith([]), "cheerful")).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });
});
