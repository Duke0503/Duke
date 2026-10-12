import { describe, expect, it } from "vitest";
import {
  parseSessionSummary,
  splitCorrection,
  toCorrections,
  toMemoryCard,
  toVocabulary,
} from "./session-summary";

const counter = (): (() => string) => {
  let n = 0;
  return () => `id-${++n}`;
};

const GOOD = JSON.stringify({
  topic: "job interview practice",
  summary: "We practised past tense and small talk.",
  mistakes: ["I finish → I finished", "He don't → He doesn't"],
  newWords: ["shipped", "deadline", "code review"],
});

describe("parseSessionSummary", () => {
  it("reads plain JSON", () => {
    const summary = parseSessionSummary(GOOD);
    expect(summary?.topic).toBe("job interview practice");
    expect(summary?.mistakes).toHaveLength(2);
  });

  it("survives markdown fences and a friendly sentence in front", () => {
    const wrapped = "Sure! Here you go:\n```json\n" + GOOD + "\n```\nHope that helps.";
    expect(parseSessionSummary(wrapped)?.topic).toBe("job interview practice");
  });

  it("returns null when there is no JSON at all", () => {
    expect(parseSessionSummary("I could not do that.")).toBeNull();
    expect(parseSessionSummary("{not json}")).toBeNull();
  });

  it("clamps a runaway reply instead of trusting it", () => {
    const huge = JSON.stringify({
      topic: "t".repeat(500),
      summary: "s".repeat(5000),
      mistakes: Array.from({ length: 50 }, (_, i) => `a${i} → b${i}`),
      newWords: Array.from({ length: 50 }, (_, i) => `word${i}`),
    });
    const summary = parseSessionSummary(huge);
    expect(summary?.topic.length).toBe(80);
    expect(summary?.summary.length).toBe(400);
    expect(summary?.mistakes.length).toBe(10);
    expect(summary?.newWords.length).toBe(12);
  });

  it("drops wrong types quietly", () => {
    const messy = JSON.stringify({ topic: 42, mistakes: "nope", newWords: [1, "ok", null] });
    const summary = parseSessionSummary(messy);
    expect(summary?.topic).toBe("");
    expect(summary?.mistakes).toEqual([]);
    expect(summary?.newWords).toEqual(["ok"]);
  });
});

describe("splitCorrection", () => {
  it("splits on every arrow the model might use", () => {
    expect(splitCorrection("I finish → I finished")).toEqual({ said: "I finish", fixed: "I finished" });
    expect(splitCorrection("I finish -> I finished")).toEqual({ said: "I finish", fixed: "I finished" });
    expect(splitCorrection("I finish => I finished")).toEqual({ said: "I finish", fixed: "I finished" });
  });

  it("returns null when there is nothing to split", () => {
    expect(splitCorrection("past tense mistake")).toBeNull();
    expect(splitCorrection("→ no left side")).toBeNull();
    expect(splitCorrection("no right side →")).toBeNull();
  });
});

describe("toCorrections", () => {
  it("keeps only the mistakes with a usable arrow", () => {
    const summary = parseSessionSummary(GOOD);
    expect(summary).not.toBeNull();
    const items = toCorrections("s1", summary!, counter());
    expect(items).toHaveLength(2);
    expect(items[0]?.said).toBe("I finish");
    expect(items[0]?.fixed).toBe("I finished");
    expect(items[0]?.sessionId).toBe("s1");
  });
});

describe("toVocabulary", () => {
  it("copies the new words across", () => {
    const summary = parseSessionSummary(GOOD);
    const items = toVocabulary("s1", summary!, counter());
    expect(items.map((i) => i.word)).toEqual(["shipped", "deadline", "code review"]);
  });
});

describe("toMemoryCard", () => {
  it("turns an empty summary into an empty card", () => {
    const summary = parseSessionSummary("{}");
    const card = toMemoryCard("Leo", summary!);
    expect(card.topic).toBeNull();
    expect(card.mistakes).toEqual([]);
  });

  it("caps the lists so the next prompt stays small", () => {
    const summary = parseSessionSummary(
      JSON.stringify({ mistakes: Array.from({ length: 10 }, (_, i) => `a${i} → b${i}`) }),
    );
    expect(toMemoryCard("Leo", summary!).mistakes.length).toBeLessThanOrEqual(5);
  });
});
