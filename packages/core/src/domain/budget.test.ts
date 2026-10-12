import { describe, expect, it } from "vitest";
import { checkBudget } from "./budget";

const nothingUsed = { livekitMinutes: 0, azureChars: 0, currentCallSeconds: 0 };

describe("checkBudget", () => {
  it("is ok on a fresh month", () => {
    const verdict = checkBudget(nothingUsed);
    expect(verdict.level).toBe("ok");
    expect(verdict.replyScale).toBe(1);
  });

  it("warns at 90% of the monthly minutes", () => {
    const verdict = checkBudget({ ...nothingUsed, livekitMinutes: 900 });
    expect(verdict.level).toBe("warn");
    expect(verdict.replyScale).toBeLessThan(1);
  });

  it("stops once the monthly voice characters are gone", () => {
    expect(checkBudget({ ...nothingUsed, azureChars: 500_000 }).level).toBe("stop");
  });

  it("stops a call that runs past the per-call cap", () => {
    expect(checkBudget({ ...nothingUsed, currentCallSeconds: 30 * 60 }).level).toBe("stop");
  });
});
