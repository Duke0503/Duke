/**
 * Every environment variable Duke reads, in one place.
 *
 * Two jobs:
 *
 *  1. {@link inspectEnv} — a report of what is set and what is still missing. It never
 *     throws, so `GET /api/ready` and `pnpm doctor` can tell the owner exactly which key
 *     to paste, and where to get it.
 *  2. {@link requireEnv} and the small getters — read a value, or fail with a message that
 *     names the key.
 *
 * This is the reason the whole app can be built before any key exists: nothing throws at
 * import time, keys are only demanded at the moment a provider is actually used.
 *
 * Rule: anything without `NEXT_PUBLIC_` stays on the server. A provider key must never be
 * readable by the browser.
 */

import { AppError } from "./app-error";

// ---------------------------------------------------------------- the key list

export interface EnvKeyInfo {
  /** The exact variable name. */
  readonly key: string;
  /** What a human should call it. */
  readonly label: string;
  /** Where to copy it from. */
  readonly where: string;
  /** True if it must never reach the browser. */
  readonly secret: boolean;
  /** An example value, shown in the report. Not a real key. */
  readonly example?: string;
  /** True when the app works without it (a feature just stays off). */
  readonly optional?: boolean;
}

export interface EnvGroup {
  readonly id: string;
  readonly title: string;
  /** One line: what this service does for Duke. */
  readonly why: string;
  /** Where to create the account / copy the keys. */
  readonly url: string;
  readonly keys: readonly EnvKeyInfo[];
}

export const ENV_GROUPS: readonly EnvGroup[] = [
  {
    id: "app",
    title: "App",
    why: "How Duke runs. These already have working defaults.",
    url: "",
    keys: [
      { key: "NODE_ENV", label: "Node environment", where: "already set", secret: false, example: "development", optional: true },
      { key: "API_PORT", label: "API port", where: "already set", secret: false, example: "3001", optional: true },
      { key: "WEB_ORIGIN", label: "Browser origin (CORS)", where: "already set", secret: false, example: "http://localhost:3000", optional: true },
      { key: "LOG_LEVEL", label: "Log level", where: "already set", secret: false, example: "debug", optional: true },
      { key: "LOG_DIR", label: "Log folder", where: "already set", secret: false, example: "logs", optional: true },
      { key: "LOG_RETENTION_DAYS", label: "Log retention (days)", where: "already set", secret: false, example: "14", optional: true },
    ],
  },
  {
    id: "livekit",
    title: "LiveKit Cloud",
    why: "The phone line. Carries the live audio between the phone and the agent.",
    url: "https://cloud.livekit.io",
    keys: [
      { key: "LIVEKIT_URL", label: "Project URL", where: "Project -> Settings -> Keys (starts with wss://)", secret: false, example: "wss://your-project.livekit.cloud" },
      { key: "LIVEKIT_API_KEY", label: "API key", where: "Project -> Settings -> Keys", secret: true },
      { key: "LIVEKIT_API_SECRET", label: "API secret", where: "Project -> Settings -> Keys", secret: true },
    ],
  },
  {
    id: "deepgram",
    title: "Deepgram",
    why: "The ears. Turns your voice into text.",
    url: "https://console.deepgram.com",
    keys: [
      { key: "DEEPGRAM_API_KEY", label: "API key", where: "Console -> API Keys -> Create a key", secret: true },
    ],
  },
  {
    id: "groq",
    title: "Groq",
    why: "The brain. Thinks up the reply very fast.",
    url: "https://console.groq.com/keys",
    keys: [
      { key: "GROQ_API_KEY", label: "API key", where: "Console -> API Keys -> Create key (starts with gsk_)", secret: true },
    ],
  },
  {
    id: "azure",
    title: "Azure Speech",
    why: "The voice. Speaks with real emotion.",
    url: "https://portal.azure.com",
    keys: [
      { key: "AZURE_SPEECH_KEY", label: "Speech key", where: "Speech resource -> Keys and Endpoint -> KEY 1", secret: true },
      { key: "AZURE_SPEECH_REGION", label: "Region", where: "Speech resource -> Keys and Endpoint -> Location", secret: false, example: "eastus" },
    ],
  },
  {
    id: "database",
    title: "Supabase / Postgres",
    why: "The memory. Saves your characters, calls and transcripts.",
    url: "https://supabase.com/dashboard",
    keys: [
      { key: "DATABASE_URL", label: "Postgres URL", where: "Project -> Connect -> Connection string (URI)", secret: true, example: "postgresql://user:pass@host:5432/postgres" },
    ],
  },
  {
    id: "redis",
    title: "Redis (Upstash or local)",
    why: "The short-term memory and the audio cache. Saves money.",
    url: "https://console.upstash.com",
    keys: [
      { key: "REDIS_URL", label: "Redis URL", where: "Upstash -> Redis -> Connect (use the rediss:// URL)", secret: true, example: "rediss://default:pass@host:6379" },
    ],
  },
];

/** Every key Duke knows about, flattened. */
export const ALL_ENV_KEYS: readonly EnvKeyInfo[] = ENV_GROUPS.flatMap((group) => group.keys);

/** Required keys = not optional. These are what `pnpm doctor` counts. */
export const REQUIRED_ENV_KEYS: readonly string[] = ALL_ENV_KEYS.filter((k) => k.optional !== true).map((k) => k.key);

// ---------------------------------------------------------------- placeholders

/**
 * Values that mean "I copied .env.example and forgot to fill it in".
 * Catching them turns a silent 401 an hour later into an obvious message now.
 */
const PLACEHOLDER_PATTERN = /^(changeme|change-me|replace-me|replace_me|your[-_]?key[: ].*|xxx+|todo|placeholder|sk-xxx.*)$/i;

export function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || PLACEHOLDER_PATTERN.test(trimmed);
}

// ---------------------------------------------------------------- reading

const read = (env: NodeJS.ProcessEnv, key: string): string | undefined => {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export const infoForKey = (key: string): EnvKeyInfo | undefined =>
  ALL_ENV_KEYS.find((info) => info.key === key);

/**
 * Read a required value, or throw an error that tells the owner which key is missing.
 * Called lazily — at the moment a provider is used, not at import time.
 */
export function requireEnv(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = read(env, key);
  if (value === undefined) {
    const info = infoForKey(key);
    const group = ENV_GROUPS.find((candidate) => candidate.keys.some((k) => k.key === key));
    const where = info === undefined ? "" : ` ${info.where}.`;
    const link = group !== undefined && group.url.length > 0 ? ` Get it from ${group.url}.` : "";
    throw new AppError("ENV_MISSING", `${key} is not set. Add it to your .env file.${where}${link}`);
  }
  return value;
}

export function optionalEnv(key: string, fallback: string, env: NodeJS.ProcessEnv = process.env): string {
  return read(env, key) ?? fallback;
}

export function envNumber(key: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = read(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envBool(key: string, fallback: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = read(env, key);
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const isProduction = (env: NodeJS.ProcessEnv = process.env): boolean =>
  optionalEnv("NODE_ENV", "development", env) === "production";

// ---------------------------------------------------------------- the report

export interface EnvKeyStatus {
  readonly info: EnvKeyInfo;
  /** True when a real value is present. */
  readonly set: boolean;
  /** True when the value is still an obvious placeholder. */
  readonly placeholder: boolean;
  /** The value, but only for non-secret keys. Secrets are never echoed. */
  readonly value: string | undefined;
}

export interface EnvGroupStatus {
  readonly group: EnvGroup;
  readonly keys: readonly EnvKeyStatus[];
  /** True when every required key in the group is set. */
  readonly complete: boolean;
}

export interface EnvReport {
  /** True when every required key is set and none is a placeholder. */
  readonly ready: boolean;
  /** Required keys with no value at all. */
  readonly missing: readonly string[];
  /** Keys still holding a placeholder. */
  readonly placeholders: readonly string[];
  readonly groups: readonly EnvGroupStatus[];
}

/**
 * Look at the environment and say what is done and what is left.
 * Never throws — this is the function `/api/ready` and `pnpm doctor` are built on.
 */
export function inspectEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const missing: string[] = [];
  const placeholders: string[] = [];

  const groups = ENV_GROUPS.map((group): EnvGroupStatus => {
    const keys = group.keys.map((info): EnvKeyStatus => {
      const raw = read(env, info.key);
      const isPlaceholderValue = raw !== undefined && isPlaceholder(raw);
      if (raw === undefined && info.optional !== true) missing.push(info.key);
      if (isPlaceholderValue && info.optional !== true) placeholders.push(info.key);
      return {
        info,
        set: raw !== undefined && !isPlaceholderValue,
        placeholder: isPlaceholderValue,
        value: info.secret ? undefined : raw,
      };
    });
    return { group, keys, complete: keys.every((k) => k.info.optional === true || k.set) };
  });

  return {
    ready: missing.length === 0 && placeholders.length === 0,
    missing,
    placeholders,
    groups,
  };
}

/** A short "3 keys left" style line, for logs and the health endpoint. */
export function summarizeEnv(report: EnvReport): string {
  if (report.ready) return `all ${REQUIRED_ENV_KEYS.length} required keys are set`;
  const parts: string[] = [];
  if (report.missing.length > 0) parts.push(`missing ${report.missing.length}: ${report.missing.join(", ")}`);
  if (report.placeholders.length > 0) parts.push(`still placeholder: ${report.placeholders.join(", ")}`);
  return parts.join("; ");
}
