import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_ID, voiceForRole, voiceChoices, looksSavage } from "./voice";

describe("voiceForRole", () => {
  it("falls back to the friendly default when the role says nothing useful", () => {
    expect(voiceForRole("").voiceId).toBe(DEFAULT_VOICE_ID);
    expect(voiceForRole("astronaut from Mars").voiceId).toBe(DEFAULT_VOICE_ID);
  });

  it("understands free-text roles, not just exact labels", () => {
    expect(voiceForRole("my old maths teacher").id).toBe("teacher");
    expect(voiceForRole("Senior Developer").id).toBe("developer");
    expect(voiceForRole("a barista at my cafe").id).toBe("barista");
    expect(voiceForRole("british").id).toBe("british");
  });

  it("prefers the role that matches the most words", () => {
    // "english" would pull toward the teacher on its own; "developer" also hits once,
    // but "software engineer" scores twice.
    expect(voiceForRole("software engineer").id).toBe("developer");
  });

  it("picks the savage voice when the role asks for it", () => {
    expect(voiceForRole("savage friend").voiceId).toBe("en-US-DavisNeural");
  });
});

describe("looksSavage", () => {
  it("is true only for the teasing role", () => {
    expect(looksSavage("savage friend")).toBe(true);
    expect(looksSavage("english teacher")).toBe(false);
  });
});

describe("voiceChoices", () => {
  it("returns the built-in list by default", () => {
    expect(voiceChoices().length).toBeGreaterThan(0);
  });

  it("appends an unknown saved voice so the picker can still show it", () => {
    const choices = voiceChoices("en-AU-WilliamNeural");
    expect(choices.at(-1)?.voiceId).toBe("en-AU-WilliamNeural");
  });

  it("does not duplicate a voice that is already in the list", () => {
    const choices = voiceChoices("en-US-AriaNeural");
    expect(choices.filter((c) => c.voiceId === "en-US-AriaNeural")).toHaveLength(1);
  });
});
