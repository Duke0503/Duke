import { describe, expect, it } from "vitest";
import { MoodTagStripper } from "./mood-stream";

/** Feed chunks one at a time, as the model would. */
function stream(chunks: readonly string[]): { text: string; mood: string | null } {
  const stripper = new MoodTagStripper();
  let text = "";
  let mood: string | null = null;

  for (const chunk of chunks) {
    const out = stripper.push(chunk);
    text += out.text;
    mood = out.mood ?? mood;
  }

  return { text: text + stripper.flush(), mood };
}

describe("MoodTagStripper", () => {
  it("removes a tag that arrives whole", () => {
    const { text, mood } = stream(["[[cheerful]] Hi there!"]);

    expect(mood).toBe("cheerful");
    expect(text).toBe("Hi there!");
  });

  it("removes a tag split across chunks, one character at a time", () => {
    const { text, mood } = stream([..."[[calm]] Breathe."]);

    expect(mood).toBe("calm");
    expect(text).toBe("Breathe.");
  });

  it("removes a tag split at an awkward place", () => {
    // The space after the tag lands in the next chunk; it is not speech.
    expect(stream(["[[", "cheer", "ful]]", " Hi!"])).toEqual({ text: "Hi!", mood: "cheerful" });
  });

  it("passes a reply with no tag straight through", () => {
    const { text, mood } = stream(["Hey", " the", "re!"]);

    expect(mood).toBeNull();
    expect(text).toBe("Hey there!");
  });

  it("holds a lone bracket until it is known to be text", () => {
    const { text, mood } = stream(["["]);

    expect(mood).toBeNull();
    expect(text).toBe("[");
  });

  it("treats an unknown tag as no mood but still removes it", () => {
    const { text, mood } = stream(["[[laughing]] Ha!"]);

    expect(mood).toBeNull();
    expect(text).toBe("Ha!");
  });

  it("stops looking once the first word is out", () => {
    // A tag later in the sentence is not a tag — it is the character saying it.
    const { text, mood } = stream(["Sure. [[sad]]"]);

    expect(mood).toBeNull();
    expect(text).toBe("Sure. [[sad]]");
  });

  it("gives up on a runaway 'tag' so the first word is not delayed forever", () => {
    const { text, mood } = stream(["[[", "a".repeat(40)]);

    expect(mood).toBeNull();
    expect(text).toBe(`[[${"a".repeat(40)}`);
  });

  it("skips the whitespace between the tag and the first word", () => {
    const { text, mood } = stream(["\n[[friendly]]\n\nHello."]);

    expect(mood).toBe("friendly");
    expect(text).toBe("Hello.");
  });

  it("reports the mood on the chunk that carried the tag, and only once", () => {
    const stripper = new MoodTagStripper();

    expect(stripper.push("[[excited]]").mood).toBe("excited");
    expect(stripper.push(" Yes!").mood).toBeNull();
    expect(stripper.found).toBe("excited");
  });

  it("flushes nothing extra for a normal reply", () => {
    const stripper = new MoodTagStripper();
    stripper.push("[[serious]] We need to talk.");
    stripper.push(" Now.");

    expect(stripper.flush()).toBe("");
  });
});
