import { describe, expect, it } from "vitest";
import { checkSavage } from "./savage-guard";

describe("checkSavage", () => {
  it("allows playful teasing about the mistake", () => {
    expect(checkSavage("'I finish the report yesterday'? Bold choice of tense.").allowed).toBe(true);
  });

  it("blocks insults about intelligence", () => {
    expect(checkSavage("you are stupid").allowed).toBe(false);
  });

  it("blocks attacks on the family", () => {
    expect(checkSavage("say hi to your mother for me").allowed).toBe(false);
  });
});
