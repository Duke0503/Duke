import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ENV_PATHS, loadEnvFiles, parseEnvFile } from "./env-file";

/**
 * This runs before the app can report anything, so it must be boring and it must not throw.
 * The rule with the most value: what you type on the command line beats the file.
 */

describe("parseEnvFile", () => {
  it("reads plain pairs", () => {
    const values = parseEnvFile("GROQ_API_KEY=gsk_abc\nAPI_PORT=3001\n");
    expect(values.get("GROQ_API_KEY")).toBe("gsk_abc");
    expect(values.get("API_PORT")).toBe("3001");
  });

  it("skips comments, blank lines and nonsense", () => {
    const values = parseEnvFile(
      ["# a comment", "", "   ", "not a pair", "=novalue", "1BAD=x", "GOOD=1"].join("\n"),
    );
    expect([...values.keys()]).toEqual(["GOOD"]);
  });

  it("strips an export prefix", () => {
    expect(parseEnvFile("export AZURE_SPEECH_REGION=eastus").get("AZURE_SPEECH_REGION")).toBe(
      "eastus",
    );
  });

  it("keeps the quotes out of the value", () => {
    expect(parseEnvFile('A="hello world"').get("A")).toBe("hello world");
    expect(parseEnvFile("B='hello world'").get("B")).toBe("hello world");
  });

  it("keeps a value literal, including an equals sign and a hash", () => {
    const url = "postgresql://duke:p#ss=word@host:5432/duke";
    expect(parseEnvFile(`DATABASE_URL=${url}`).get("DATABASE_URL")).toBe(url);
  });

  it("drops a trailing comment only when there is a space before it", () => {
    expect(parseEnvFile("A=one # why\n").get("A")).toBe("one");
    expect(parseEnvFile("B=one#why\n").get("B")).toBe("one#why");
  });

  it("tolerates windows line endings", () => {
    expect(parseEnvFile("A=1\r\nB=2\r\n").get("B")).toBe("2");
  });

  it("lets the last line win when a key is repeated", () => {
    expect(parseEnvFile("A=1\nA=2").get("A")).toBe("2");
  });
});

describe("loadEnvFiles", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "duke-env-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("fills in what is unset and reports it", async () => {
    const path = join(dir, ".env");
    await writeFile(path, "GROQ_API_KEY=gsk_from_file\n", "utf8");
    const env: NodeJS.ProcessEnv = {};

    const report = loadEnvFiles([path], env);

    expect(env["GROQ_API_KEY"]).toBe("gsk_from_file");
    expect(report.loaded).toEqual([path]);
    expect(report.applied).toEqual(["GROQ_API_KEY"]);
  });

  it("never overrides a variable that is already in the environment", async () => {
    const path = join(dir, ".env");
    await writeFile(path, "GROQ_MODEL=from-file\n", "utf8");
    const env: NodeJS.ProcessEnv = { GROQ_MODEL: "from-shell" };

    const report = loadEnvFiles([path], env);

    expect(env["GROQ_MODEL"]).toBe("from-shell");
    expect(report.overridden).toEqual(["GROQ_MODEL"]);
    expect(report.applied).toEqual([]);
  });

  it("treats an empty environment value as unset, so the file can fill it", async () => {
    const path = join(dir, ".env");
    await writeFile(path, "API_PORT=3001\n", "utf8");
    const env: NodeJS.ProcessEnv = { API_PORT: "" };

    loadEnvFiles([path], env);

    expect(env["API_PORT"]).toBe("3001");
  });

  it("does not throw when the file is not there", () => {
    const env: NodeJS.ProcessEnv = {};

    const report = loadEnvFiles([join(dir, "nope.env")], env);

    expect(report.loaded).toEqual([]);
    expect(report.missing).toEqual([join(dir, "nope.env")]);
    expect(report.applied).toEqual([]);
  });

  it("reads both candidates, first one winning", async () => {
    const service = join(dir, "service.env");
    const root = join(dir, "root.env");
    await writeFile(service, "SAME=service\nONLY_A=1\n", "utf8");
    await writeFile(root, "SAME=root\nONLY_B=2\n", "utf8");
    const env: NodeJS.ProcessEnv = {};

    const report = loadEnvFiles([service, root], env);

    expect(env["SAME"]).toBe("service");
    expect(env["ONLY_A"]).toBe("1");
    expect(env["ONLY_B"]).toBe("2");
    expect(report.loaded).toHaveLength(2);
  });

  it("looks in the service folder and the repo root by default", () => {
    expect(DEFAULT_ENV_PATHS).toEqual([".env", "../../.env"]);
  });
});
