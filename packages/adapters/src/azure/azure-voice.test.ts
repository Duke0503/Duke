import { describe, expect, it } from "vitest";
import { buildSsml, extractPcm, framePcm } from "../azure/azure-voice";
import { MOOD_TO_STYLE } from "@duke/core";

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
