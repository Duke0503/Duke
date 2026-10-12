import { describe, expect, it } from "vitest";
import { MOODS, MOOD_TO_STYLE, isMood, stripMoodTag } from "./mood";

describe("stripMoodTag", () => {
  it("pulls a valid mood tag off the front", () => {
    expect(stripMoodTag("[[cheerful]] Hey there!")).toEqual({
      mood: "cheerful",
      speech: "Hey there!",
    });
  });

  it("is case-insensitive", () => {
    expect(stripMoodTag("[[CHEERFUL]] Hi")).toEqual({ mood: "cheerful", speech: "Hi" });
  });

  it("keeps an unknown tag in the text", () => {
    expect(stripMoodTag("[[banana]] Hi")).toEqual({ mood: null, speech: "[[banana]] Hi" });
  });

  it("only reads a tag at the very start", () => {
    expect(stripMoodTag("Hi [[cheerful]]")).toEqual({ mood: null, speech: "Hi [[cheerful]]" });
  });

  it("handles a reply with no tag", () => {
    expect(stripMoodTag("   Hi   ")).toEqual({ mood: null, speech: "Hi" });
  });
});

describe("mood -> voice style", () => {
  it("has an entry for every mood", () => {
    for (const mood of MOODS) {
      expect(MOOD_TO_STYLE[mood].degree).toBeGreaterThan(0);
    }
  });

  it("recognises only real moods", () => {
    expect(isMood("cheerful")).toBe(true);
    expect(isMood("banana")).toBe(false);
  });
});
