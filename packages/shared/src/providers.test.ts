import { describe, expect, it } from "vitest";
import { DEFAULT_DEEPGRAM_MODEL, DEFAULT_GROQ_MODEL, groqReasoningEffort } from "./providers";

/**
 * Small file, but the rule it holds was expensive to find: a reasoning model with no budget
 * answers with an empty string, and nothing anywhere errors.
 */

describe("groqReasoningEffort", () => {
  it("turns reasoning low for the models that reason by default", () => {
    expect(groqReasoningEffort("openai/gpt-oss-20b")).toBe("low");
    expect(groqReasoningEffort("openai/gpt-oss-120b")).toBe("low");
  });

  it("is not fooled by case, which is how a person types it", () => {
    expect(groqReasoningEffort("OpenAI/GPT-OSS-120B")).toBe("low");
  });

  it("stays silent for a model that would reject the parameter", () => {
    expect(groqReasoningEffort("llama-3.3-70b-versatile")).toBeUndefined();
    expect(groqReasoningEffort("allam-2-7b")).toBeUndefined();
    expect(groqReasoningEffort("qwen/qwen3.8-27b")).toBeUndefined();
  });
});

describe("the defaults", () => {
  it("names a model that exists, not the retired one", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-20b");
    expect(DEFAULT_GROQ_MODEL).not.toContain("llama-3.3-70b");
  });

  it("uses one speech model everywhere", () => {
    expect(DEFAULT_DEEPGRAM_MODEL).toBe("nova-3");
  });
});
