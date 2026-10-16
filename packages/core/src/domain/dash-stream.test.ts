import { describe, expect, it } from "vitest";
import { DashRewriter, rewriteDashes } from "./dash-stream";

const EM = "\u2014";
const EN = "\u2013";
const BAR = "\u2015";
const FIGURE = "\u2012";
const MINUS = "\u2212";
const NB_HYPHEN = "\u2011";

describe("rewriteDashes", () => {
  it("turns a spaced em dash into a comma", () => {
    expect(rewriteDashes(`I was tired ${EM} really tired.`)).toBe("I was tired, really tired.");
  });

  it("turns an unspaced em dash into a comma and a space", () => {
    expect(rewriteDashes(`tired${EM}really`)).toBe("tired, really");
  });

  it("turns an en dash into a comma", () => {
    expect(rewriteDashes(`he came ${EN} late again`)).toBe("he came, late again");
  });

  it("turns a horizontal bar, a figure dash and a minus sign into a comma", () => {
    expect(rewriteDashes(`a ${BAR} b`)).toBe("a, b");
    expect(rewriteDashes(`a ${FIGURE} b`)).toBe("a, b");
    expect(rewriteDashes(`a ${MINUS} b`)).toBe("a, b");
  });

  it("turns a hyphen with space on both sides into a comma", () => {
    expect(rewriteDashes("I came home - tired.")).toBe("I came home, tired.");
  });

  it("leaves a hyphen inside a word alone", () => {
    expect(rewriteDashes("a well-known problem")).toBe("a well-known problem");
  });

  it("normalizes a non-breaking hyphen inside a word to a plain one", () => {
    expect(rewriteDashes(`well${NB_HYPHEN}known`)).toBe("well-known");
  });

  it("treats a spaced non-breaking hyphen as a dash", () => {
    expect(rewriteDashes(`home ${NB_HYPHEN} tired`)).toBe("home, tired");
  });

  it("drops a dash that has nothing after it", () => {
    expect(rewriteDashes("it was fine -")).toBe("it was fine");
    expect(rewriteDashes("it was fine - ")).toBe("it was fine");
  });

  it("never leaves a space before a comma, nor two commas", () => {
    expect(rewriteDashes("a , , b")).toBe("a, b");
    expect(rewriteDashes(`a ,${EM} b`)).toBe("a, b");
  });

  it("never opens a sentence with a comma", () => {
    expect(rewriteDashes(`${EM} well then`)).toBe("well then");
  });

  it("leaves text with no dash completely alone", () => {
    const plain = "How was your day? I made tea and read a book.";
    expect(rewriteDashes(plain)).toBe(plain);
  });

  it("keeps a normal comma where it was", () => {
    expect(rewriteDashes("Well, that is that.")).toBe("Well, that is that.");
  });
});

describe("DashRewriter", () => {
  it("reads a dash split across two chunks", () => {
    const r = new DashRewriter();
    const spoken = r.push("I came home -") + r.push(" tired.");
    expect(spoken).toBe("I came home, tired.");
  });

  it("reads an em dash split across two chunks", () => {
    const r = new DashRewriter();
    const spoken = r.push("word ") + r.push(`${EM} b`);
    expect(spoken).toBe("word, b");
  });

  it("does not merge a hyphenated word split across two chunks", () => {
    const r = new DashRewriter();
    const spoken = r.push("a well-") + r.push("known problem");
    expect(spoken).toBe("a well-known problem");
  });

  it("keeps the space between words that arrive apart", () => {
    const r = new DashRewriter();
    const spoken = r.push("Hello ") + r.push("world");
    expect(spoken).toBe("Hello world");
  });

  it("never loses the tail, even a trailing dash", () => {
    const r = new DashRewriter();
    const spoken = r.push("it was fine -") + r.flush();
    expect(spoken).toBe("it was fine");
    expect(r.flush()).toBe("");
  });

  it("keeps the comma when a chunk opens with the dash", () => {
    // The shape that broke a naive version: the dash arrives at the front of its own chunk, and
    // the comma belongs after the word before it, not at the start of a sentence.
    const r = new DashRewriter();
    const spoken = r.push("I came home -") + r.push(" tired.") + r.flush();
    expect(spoken).toBe("I came home, tired.");
  });

  it("speaks what a reply held when it ends mid-pause", () => {
    const r = new DashRewriter();
    expect(r.push("wait ") + r.flush()).toBe("wait ");
  });

  it("is a no-op for a reply with no dash at all", () => {
    const r = new DashRewriter();
    const chunks = ["Oh ", "really? ", "Tell ", "me ", "more."];
    expect(chunks.map((c) => r.push(c)).join("") + r.flush()).toBe("Oh really? Tell me more.");
  });

  it("turns a dash into a comma without eating the following word", () => {
    const r = new DashRewriter();
    const spoken = r.push("so I said ") + r.push(`${EN} `) + r.push("nothing") + r.flush();
    expect(spoken).toBe("so I said, nothing");
  });
});
