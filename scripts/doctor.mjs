#!/usr/bin/env node
/**
 * `pnpm doctor` — is this machine ready to run Duke?
 *
 * This is the answer to "it started, but nothing works". Almost every failure Duke can have
 * before it makes a call is a setup problem: a key that is missing, a key pasted into the wrong
 * slot, a region that says `eastus` when the resource is in `westus`, a log folder the process
 * cannot write to, a database host that does not answer. None of them are interesting, and from
 * the phone they all look the same: silence.
 *
 * So this prints one screen saying exactly which line to fix, and exits non-zero when something
 * blocking is wrong — which makes it usable from a deploy script as well as by hand.
 *
 * What it does **not** do: check whether a key is *valid*. That would mean calling every
 * provider, and a wrong endpoint or a changed rate limit would make doctor lie: reporting a good
 * key as bad is worse than reporting nothing. Presence is checked, shape is checked, and the two
 * servers you run yourself are actually connected to. Validating a provider key stays the job of
 * the first real call, which fails with the provider's own message.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, Socket } from "node:net";
import { join, resolve } from "node:path";

// ------------------------------------------------------------------ tiny terminal

const useColor = process.stdout.isTTY === true;
const paint = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const red = paint("31");
const green = paint("32");
const yellow = paint("33");
const dim = paint("2");
const bold = paint("1");

const PASS = green("ok  ");
const FAIL = red("FAIL");
const WARN = yellow("warn");

/** Blocking. Any of these makes the exit code non-zero. */
const problems = [];
/** Suspicious, not fatal. A value can be odd and still work. */
const warnings = [];
/**
 * Blocking problems that are missing keys, counted separately.
 *
 * The key list is one screen with one line per value, so a single `fail()` covers nine keys.
 * Counting it as one problem would say "1 problem" while nine keys are blank, so the footer adds
 * these up instead.
 */
let missingKeys = 0;

const pass = (message) => console.log(`  ${PASS} ${message}`);
const fail = (message) => {
  problems.push(message);
  console.log(`  ${FAIL} ${message}`);
};
const warn = (message) => {
  warnings.push(message);
  console.log(`  ${WARN} ${message}`);
};

const heading = (title) => console.log(`\n${bold(title)}`);

// ------------------------------------------------------------------ the shared toolkit

/**
 * The key list, the checker and the log paths all live in `@duke/shared` — the same code the API
 * and the agent use, so doctor cannot drift away from what the apps actually read.
 *
 * It has to be built first. `pnpm doctor` builds it (see the root `package.json`); this is the
 * message for anyone running `node scripts/doctor.mjs` by hand.
 */
const ROOT = resolve(import.meta.dirname, "..");

let shared;
try {
  shared = await import("../packages/shared/dist/index.js");
} catch {
  console.error(
    `\n${red("packages/shared is not built.")}\n` +
      `  Install and build first:\n    ${dim("pnpm install && pnpm build")}\n` +
      `  Then run doctor again.\n`,
  );
  process.exit(2);
}

const { infoForKey, inspectEnv, loadEnvFiles, resolveLogDir, summarizeEnv } = shared;

// ------------------------------------------------------------------ the key shapes

/**
 * What a correct value looks like.
 *
 * These are not decoration: most setup mistakes that cost an evening are shape mistakes, and each
 * rule says what went wrong in the words that fix it. They are **warnings**, never failures — a
 * value that does not match the rule is suspicious, not impossible, and doctor must never block a
 * call that would have worked.
 */
const SHAPE_RULES = [
  { key: "LIVEKIT_URL", test: (v) => /^wss?:\/\//.test(v), hint: "should start with wss:// — this is the LiveKit URL, not an http:// address" },
  { key: "LIVEKIT_API_KEY", test: (v) => /^API[A-Za-z0-9]+$/.test(v), hint: 'should look like APIxxxxxxxx — this is the key, not the secret' },
  { key: "DEEPGRAM_API_KEY", test: (v) => v.length >= 20 && !v.includes("://"), hint: "should be a long key with no :// in it" },
  { key: "GROQ_API_KEY", test: (v) => v.startsWith("gsk_"), hint: "should start with gsk_" },
  { key: "AZURE_SPEECH_KEY", test: (v) => v.length >= 20 && !v.includes("://") && !/\s/.test(v), hint: "should be a 32-character hex key, no spaces, no ://" },
  { key: "AZURE_SPEECH_REGION", test: (v) => /^[a-z0-9]+$/.test(v), hint: 'should be just the region, e.g. "eastus" — not a URL and not the resource name' },
  { key: "AZURE_VOICE", test: (v) => /^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(v), hint: "should look like en-US-AriaNeural" },
  { key: "DATABASE_URL", test: (v) => /^postgres(ql)?:\/\//.test(v), hint: "should start with postgresql:// (Supabase: Project -> Connect -> Connection string URI)" },
  { key: "REDIS_URL", test: (v) => /^rediss?:\/\//.test(v), hint: "should start with rediss:// or redis://" },
  { key: "API_PORT", test: (v) => /^\d{2,5}$/.test(v), hint: "should be a port number" },
  { key: "LOG_DIR", test: (v) => v.length > 0 && !/\s/.test(v), hint: "should be a folder path with no spaces" },
];

/** Ports implied by the URL schemes Duke uses. */
function defaultPort(protocol) {
  switch (protocol) {
    case "postgres:":
    case "postgresql:":
      return 5432;
    case "redis:":
      return 6379;
    case "rediss:":
      return 6380;
    case "http:":
    case "ws:":
      return 80;
    case "https:":
    case "wss:":
      return 443;
    default:
      return null;
  }
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ checks

function checkVersions() {
  heading("Runtime");

  const node = process.versions.node;
  const major = Number(node.split(".")[0]);
  if (major >= 22) pass(`node ${node}`);
  else fail(`node ${node} — Duke needs 22 or newer (check \`node --version\`)`);

  // pnpm is what ran this script, so it is present by definition. The version only changes how
  // install scripts are handled, hence a warning rather than a failure.
  const pnpm = process.env["npm_config_user_agent"]?.match(/pnpm\/([\d.]+)/)?.[1];
  if (pnpm === undefined) pass("pnpm (started directly with node, so the version is unknown)");
  else if (Number(pnpm.split(".")[0]) >= 10) pass(`pnpm ${pnpm}`);
  else warn(`pnpm ${pnpm} — this repo was built against pnpm 10`);
}

function checkEnv() {
  heading("Keys");

  // Read the repo root `.env`, wherever doctor was started from.
  const loaded = loadEnvFiles([join(ROOT, ".env")], process.env);
  if (loaded.loaded.length > 0) {
    console.log(`  ${dim(`.env: ${loaded.applied.length} values read`)}`);
  } else {
    console.log(`  ${dim("no .env yet — copy .env.example to .env and fill in the blanks")}`);
  }

  const report = inspectEnv();
  const missing = new Set(report.missing);
  const placeholders = new Set(report.placeholders);

  for (const { group, keys, complete } of report.groups) {
    const needed = keys.filter((key) => key.info.optional !== true);
    const state = complete ? green("ready") : yellow("waiting");
    console.log(`\n  ${bold(group.title)} ${dim(`— ${group.why}`)}  ${state}`);

    for (const { info } of keys) {
      const value = process.env[info.key];
      const label = info.key.padEnd(22);

      if (missing.has(info.key)) {
        console.log(`    ${FAIL} ${label} ${dim(info.where)}`);
      } else if (placeholders.has(info.key)) {
        console.log(`    ${FAIL} ${label} ${dim("still the example value — replace it")}`);
      } else if (value === undefined || value.trim().length === 0) {
        console.log(`    ${dim(`  —  ${label} optional, using the default`)}`);
      } else if (info.secret === true) {
        console.log(`    ${PASS} ${label} ${dim("set (value hidden)")}`);
      } else {
        console.log(`    ${PASS} ${label} ${dim(value.trim())}`);
      }
    }

    if (group.url.length > 0 && needed.some((key) => !key.set)) {
      console.log(`         ${dim(group.url)}`);
    }
  }

  // Shape is only worth mentioning for a key that is otherwise fine: a missing key already has a
  // bigger problem than its shape.
  const wrongShape = SHAPE_RULES.filter((rule) => {
    const value = process.env[rule.key]?.trim();
    if (value === undefined || value.length === 0) return false;
    if (missing.has(rule.key) || placeholders.has(rule.key)) return false;
    return !rule.test(value);
  });

  if (wrongShape.length > 0) {
    console.log();
    for (const rule of wrongShape) {
      const value = (process.env[rule.key] ?? "").trim();
      // A secret is shown as a shape, never as a value: these lines end up in screenshots and
      // pasted into chat, and two of them are database passwords.
      const secret = infoForKey(rule.key)?.secret === true;
      const shown = secret ? `${value.slice(0, 4)}… (${value.length} characters)` : value;
      warn(`${rule.key} = ${shown} — ${rule.hint}`);
    }
  }

  console.log();
  if (report.ready) {
    pass(summarizeEnv(report));
  } else {
    missingKeys = report.missing.length + report.placeholders.length;
    console.log(`  ${FAIL} ${summarizeEnv(report)}`);
  }
}

function checkLogFolders() {
  heading("Logs");

  const dir = resolveLogDir();
  const absolute = join(ROOT, dir);

  try {
    for (const name of shared.LOG_DIRNAMES) {
      const folder = join(absolute, name);
      mkdirSync(folder, { recursive: true });
      const probe = join(folder, ".doctor-probe");
      writeFileSync(probe, "doctor\n");
      rmSync(probe, { force: true });
    }
    pass(`${dir}/${shared.LOG_DIRNAMES.join(" + ")} is writable`);
  } catch (error) {
    fail(
      `cannot write to ${absolute} — ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log(`         ${dim("set LOG_DIR to a folder this user owns, e.g. /var/log/duke")}`);
    return;
  }

  if (!existsSync(join(absolute, "archive"))) {
    console.log(`  ${dim("archive/ appears after the first daily roll — nothing to do yet")}`);
  }
}

/** Is anything already listening where the API wants to listen? */
function checkPort() {
  heading("Ports");

  const raw = process.env["API_PORT"] ?? "3001";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`API_PORT is "${raw}" — that is not a port number`);
    return Promise.resolve();
  }

  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        warn(`port ${port} is in use — fine if the API is already running, otherwise pick another`);
      } else {
        warn(`port ${port} could not be checked (${error.code})`);
      }
      done();
    });
    probe.once("listening", () => {
      pass(`port ${port} is free`);
      probe.close(() => done());
    });
    probe.listen(port, "127.0.0.1");
  });
}

/** Open a TCP connection to the host in a URL. */
function probeTcp(url) {
  return new Promise((done) => {
    const parsed = safeUrl(url);
    if (parsed === null) {
      done({ ok: false, why: "the URL could not be parsed" });
      return;
    }

    const port = parsed.port === "" ? defaultPort(parsed.protocol) : Number(parsed.port);
    if (port === null) {
      done({ ok: false, why: `unknown protocol ${parsed.protocol}` });
      return;
    }

    const socket = new Socket();
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      done({ host: parsed.hostname, port, ...result });
    };

    socket.setTimeout(4000);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, why: "no answer in 4s" }));
    socket.once("error", (error) => finish({ ok: false, why: error.code ?? error.message }));
    socket.connect(port, parsed.hostname);
  });
}

/**
 * The two servers Duke talks to that the owner runs. Everything else is a provider, and a
 * provider being down is not a setup mistake.
 */
async function checkReachability() {
  heading("Your servers");

  for (const { key, label } of [
    { key: "DATABASE_URL", label: "Postgres" },
    { key: "REDIS_URL", label: "Redis" },
  ]) {
    const url = process.env[key]?.trim();
    if (url === undefined || url.length === 0) {
      console.log(`  ${dim(`  —  ${label}: skipped, ${key} is not set`)}`);
      continue;
    }

    const result = await probeTcp(url);
    if (result.ok) pass(`${label} at ${result.host}:${result.port} answered`);
    else warn(`${label} at ${result.host ?? "?"} — ${result.why}`);
  }
}

// ------------------------------------------------------------------ main

async function main() {
  console.log(`\n${bold("Duke doctor")} ${dim(`— ${ROOT}`)}`);

  checkVersions();
  checkEnv();
  checkLogFolders();
  await checkPort();
  await checkReachability();

  console.log();
  const blocking = problems.length + missingKeys;
  if (blocking === 0 && warnings.length === 0) {
    console.log(`${green("Everything checks out.")} Start it: ${dim("pnpm --filter @duke/api serve")}`);
  } else if (blocking === 0) {
    console.log(`${yellow(`${warnings.length} warning(s), nothing blocking.`)}`);
  } else {
    console.log(`${red(`${blocking} problem(s) to fix.`)} Every name is in .env.example.`);
  }
  console.log();

  process.exit(blocking === 0 ? 0 : 1);
}

await main();
