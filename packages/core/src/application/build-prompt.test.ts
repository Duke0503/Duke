import { describe, expect, it } from "vitest";
import type { Character } from "../domain/character";
import type { MemoryCard } from "../domain/memory-card";
import type { Turn } from "../domain/session";
import { buildGreetingPrompt, buildSummaryPrompt, buildSystemPrompt, renderTranscript } from "./build-prompt";

const character = (overrides: Partial<Character> = {}): Character => ({
  id: "c1",
  userId: "u1",
  name: "Leo",
  role: "senior developer",
  personality: "dry humour, very patient",
  voiceId: "en-US-GuyNeural",
  accent: "American",
  feedbackStyle: "quiet-tips",
  savage: false,
  avatarUrl: null,
  defaultTopic: null,
  createdAt: new Date(0),
  ...overrides,
});

const turn = (speaker: "user" | "character", text: string, index: number): Turn => ({
  id: `t${index}`,
  sessionId: "s1",
  index,
  speaker,
  text,
  createdAt: new Date(0),
});

describe("buildSystemPrompt", () => {
  it("names the character, the role and the personality", () => {
    const prompt = buildSystemPrompt({ character: character() });
    expect(prompt).toContain("You are Leo");
    expect(prompt).toContain("Role: senior developer");
    expect(prompt).toContain("dry humour, very patient");
  });

  it("demands a mood tag and lists every mood the voice understands", () => {
    const prompt = buildSystemPrompt({ character: character() });
    expect(prompt).toContain("[[cheerful]]");
    for (const mood of ["cheerful", "whisper", "sympathetic"]) {
      expect(prompt).toContain(mood);
    }
  });

  it("keeps the phone-call rule so replies stay short", () => {
    expect(buildSystemPrompt({ character: character() })).toMatch(/not an essay/);
  });

  it("marks the active feedback style and still shows the others for contrast", () => {
    const prompt = buildSystemPrompt({ character: character({ feedbackStyle: "correct-aloud" }) });
    expect(prompt).toContain('Feedback style is "correct-aloud"');
    expect(prompt).toContain("just-talk");
    expect(prompt).toContain("correct-aloud -> correct my mistakes clearly");
  });

  it("says nothing about roasting when savage is off", () => {
    expect(buildSystemPrompt({ character: character() })).not.toMatch(/roasting/);
  });

  it("adds the no-cruelty rule when savage is on", () => {
    const prompt = buildSystemPrompt({ character: character({ savage: true }) });
    expect(prompt).toMatch(/Playful roasting is ON/);
    expect(prompt).toMatch(/NEVER the person/);
    expect(prompt).toMatch(/No real insults/);
  });

  it("shortens the reply when the budget is tight", () => {
    const prompt = buildSystemPrompt({ character: character(), replyScale: 0.6 });
    expect(prompt).toMatch(/extra short/);
  });

  it("includes the memory card only when there is something remembered", () => {
    const empty: MemoryCard = { characterName: "Leo", topic: null, summary: null, mistakes: [], newWords: [] };
    expect(buildSystemPrompt({ character: character(), memoryCard: empty })).not.toMatch(/What you remember/);

    const real: MemoryCard = {
      characterName: "Leo",
      topic: "job interview practice",
      summary: "We practised past tense.",
      mistakes: ["I finish → I finished"],
      newWords: ["shipped"],
    };
    expect(buildSystemPrompt({ character: character(), memoryCard: real })).toContain("job interview practice");
  });

  it("mentions the fallback topic only when the user set one", () => {
    expect(buildSystemPrompt({ character: character() })).not.toMatch(/goes quiet/);
    expect(buildSystemPrompt({ character: character({ defaultTopic: "football" }) })).toContain("football");
  });
});

describe("renderTranscript", () => {
  it("labels the speakers and keeps the order", () => {
    const text = renderTranscript("Leo", [turn("user", "hello", 0), turn("character", "hey!", 1)]);
    expect(text).toBe("USER: hello\nLEO: hey!");
  });

  it("keeps only the newest turns, so a long call stays inside the context window", () => {
    const turns = Array.from({ length: 200 }, (_, i) => turn("user", `line ${i}`, i));
    const text = renderTranscript("Leo", turns, 10);
    expect(text).not.toContain("line 0\n");
    expect(text).toContain("line 199");
  });
});

describe("buildSummaryPrompt", () => {
  it("asks for a strict JSON object with the arrow format", () => {
    const prompt = buildSummaryPrompt({ characterName: "Leo", turns: [turn("user", "hi", 0)] });
    expect(prompt).toContain('"topic"');
    expect(prompt).toContain('"mistakes"');
    expect(prompt).toContain("→");
    expect(prompt).toMatch(/nothing else/);
    expect(prompt).toContain("USER: hi");
  });
});

describe("buildGreetingPrompt", () => {
  it("asks the character to open the call", () => {
    expect(buildGreetingPrompt(character(), false)).toMatch(/picked up the phone/);
  });

  it("asks for a callback when there is something to remember", () => {
    expect(buildGreetingPrompt(character(), true)).toMatch(/last time/);
  });
});
