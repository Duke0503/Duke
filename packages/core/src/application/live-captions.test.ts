import { describe, expect, it } from "vitest";
import { CAPTION_LIMIT, mergeCaptions, type CaptionLine } from "./live-captions";

const line = (id: string, text: string, final = true): CaptionLine => ({
  id,
  speaker: "learner",
  text,
  final,
});

describe("mergeCaptions", () => {
  it("adds a new line instead of replacing the last one", () => {
    const merged = mergeCaptions([], [{ id: "a", text: "Hello", final: true }], "learner");
    expect(merged).toEqual([{ id: "a", speaker: "learner", text: "Hello", final: true }]);
  });

  it("replaces a line that is still being spoken as it grows", () => {
    const first = mergeCaptions([], [{ id: "a", text: "Hello", final: false }], "learner");
    const second = mergeCaptions(first, [{ id: "a", text: "Hello there", final: false }], "learner");

    expect(second).toHaveLength(1);
    expect(second[0]?.text).toBe("Hello there");
  });

  it("marks the line final when the speaker stops, without moving it", () => {
    const interim = mergeCaptions([], [{ id: "a", text: "Hello", final: false }], "learner");
    const withAnother = mergeCaptions(interim, [{ id: "b", text: "Yes?", final: false }], "character");
    const settled = mergeCaptions(withAnother, [{ id: "a", text: "Hello.", final: true }], "learner");

    expect(settled.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(settled[0]?.final).toBe(true);
    expect(settled[0]?.text).toBe("Hello.");
  });

  it("ignores an empty revision rather than drawing a blank line", () => {
    const merged = mergeCaptions([line("a", "Hello")], [{ id: "b", text: "   ", final: false }], "character");
    expect(merged).toHaveLength(1);
  });

  it("attributes each line to whoever spoke it", () => {
    const mine = mergeCaptions([], [{ id: "a", text: "Hi", final: true }], "learner");
    const theirs = mergeCaptions(mine, [{ id: "b", text: "Hey", final: true }], "character");

    expect(theirs.map((entry) => entry.speaker)).toEqual(["learner", "character"]);
  });

  it("keeps the newest lines once the screen is full", () => {
    const many = Array.from({ length: CAPTION_LIMIT + 4 }, (_, i) => ({
      id: `s${i}`,
      text: `line ${i}`,
      final: true,
    }));
    const merged = mergeCaptions([], many, "learner");

    expect(merged).toHaveLength(CAPTION_LIMIT);
    expect(merged[0]?.text).toBe("line 4");
    expect(merged[merged.length - 1]?.text).toBe(`line ${CAPTION_LIMIT + 3}`);
  });

  it("does not mutate the list it was given", () => {
    const current = [line("a", "Hello")];
    mergeCaptions(current, [{ id: "b", text: "Hey", final: true }], "character");
    expect(current).toHaveLength(1);
  });
});
