import { describe, expect, it } from "vitest";
import { inspectEnv, isPlaceholder, REQUIRED_ENV_KEYS, requireEnv, summarizeEnv } from "./config";

/** A complete, valid environment. Tests drop keys from this to simulate "not set yet". */
const FULL: NodeJS.ProcessEnv = {
  LIVEKIT_URL: "wss://example.livekit.cloud",
  LIVEKIT_API_KEY: "lkkey",
  LIVEKIT_API_SECRET: "lksecret",
  DEEPGRAM_API_KEY: "dgkey",
  GROQ_API_KEY: "gsk_key",
  AZURE_SPEECH_KEY: "azkey",
  AZURE_SPEECH_REGION: "eastus",
  DATABASE_URL: "postgresql://duke:duke@localhost:5432/duke",
  REDIS_URL: "redis://localhost:6379",
};

describe("inspectEnv", () => {
  it("is not ready on an empty environment and names every missing key", () => {
    const report = inspectEnv({});
    expect(report.ready).toBe(false);
    expect(report.missing).toHaveLength(REQUIRED_ENV_KEYS.length);
    expect(report.missing).toContain("LIVEKIT_API_KEY");
    expect(report.missing).toContain("DATABASE_URL");
  });

  it("is ready once every required key is set", () => {
    const report = inspectEnv(FULL);
    expect(report.missing).toEqual([]);
    expect(report.placeholders).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it("treats a blank string as missing — that is what .env.example ships", () => {
    const report = inspectEnv({ ...FULL, GROQ_API_KEY: "   " });
    expect(report.missing).toContain("GROQ_API_KEY");
    expect(report.ready).toBe(false);
  });

  it("catches the keys people forget to fill in", () => {
    const report = inspectEnv({ ...FULL, DEEPGRAM_API_KEY: "REPLACE_ME" });
    expect(report.placeholders).toContain("DEEPGRAM_API_KEY");
    expect(report.ready).toBe(false);
  });

  it("never echoes a secret value, but does show a public one", () => {
    const report = inspectEnv(FULL);
    const keys = report.groups.flatMap((group) => group.keys);
    expect(keys.find((k) => k.info.key === "LIVEKIT_API_SECRET")?.value).toBeUndefined();
    expect(keys.find((k) => k.info.key === "AZURE_SPEECH_REGION")?.value).toBe("eastus");
  });

  it("marks a group complete only when all of its keys are usable", () => {
    const report = inspectEnv({ ...FULL, AZURE_SPEECH_REGION: "" });
    const azure = report.groups.find((group) => group.group.id === "azure");
    expect(azure?.complete).toBe(false);
    const livekit = report.groups.find((group) => group.group.id === "livekit");
    expect(livekit?.complete).toBe(true);
  });
});

describe("requireEnv", () => {
  it("returns the trimmed value", () => {
    expect(requireEnv("GROQ_API_KEY", { GROQ_API_KEY: "  gsk_abc  " })).toBe("gsk_abc");
  });

  it("throws an error that names the key and where to get it", () => {
    expect(() => requireEnv("GROQ_API_KEY", {})).toThrowError(/GROQ_API_KEY is not set/);
    expect(() => requireEnv("GROQ_API_KEY", {})).toThrowError(/console\.groq\.com/);
  });
});

describe("isPlaceholder", () => {
  it.each(["", "   ", "REPLACE_ME", "changeme", "TODO", "xxxx"])("rejects %j", (value) => {
    expect(isPlaceholder(value)).toBe(true);
  });

  it.each(["gsk_abc123", "wss://x.livekit.cloud"])("accepts %j", (value) => {
    expect(isPlaceholder(value)).toBe(false);
  });
});

describe("summarizeEnv", () => {
  it("says when everything is done", () => {
    expect(summarizeEnv(inspectEnv(FULL))).toMatch(/all .* required keys are set/);
  });

  it("lists what is left", () => {
    const line = summarizeEnv(inspectEnv({}));
    expect(line).toMatch(/missing/);
    expect(line).toContain("LIVEKIT_URL");
  });
});
