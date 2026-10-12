import { describe, expect, it } from "vitest";
import { type Character, type FeedbackStyle } from "../domain/character";
import type { Correction } from "../domain/correction";
import type { MemoryCard } from "../domain/memory-card";
import type { Session, Turn } from "../domain/session";
import type { VocabularyItem } from "../domain/vocabulary";
import { usageCounterKey } from "./keys";
import type {
  Brain,
  BrainChunk,
  BrainInput,
  Cache,
  CharacterRepository,
  Clock,
  SessionRepository,
  Transport,
} from "./ports";
import { createCharacter, updateCharacter } from "./create-character";
import { rememberLastCall } from "./memory";
import { startCall } from "./start-call";
import { endCall } from "./end-call";

// ---------------------------------------------------------------- fakes

const clock = (start = new Date("2026-10-12T10:00:00Z")): Clock => {
  const current = start;
  return { now: () => current };
};

const counter = (): (() => string) => {
  let n = 0;
  return () => `id-${++n}`;
};

class FakeCharacters implements CharacterRepository {
  readonly items = new Map<string, Character>();
  async listByUser(userId: string): Promise<Character[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async getById(id: string): Promise<Character | null> {
    return this.items.get(id) ?? null;
  }
  async save(character: Character): Promise<void> {
    this.items.set(character.id, character);
  }
  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }
}

class FakeSessions implements SessionRepository {
  readonly items = new Map<string, Session>();
  readonly turns: Turn[] = [];
  readonly savedCorrections: Correction[] = [];
  readonly savedVocabulary: VocabularyItem[] = [];

  async listByUser(userId: string): Promise<Session[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async getById(id: string): Promise<Session | null> {
    return this.items.get(id) ?? null;
  }
  async save(session: Session): Promise<void> {
    this.items.set(session.id, session);
  }
  async appendTurn(turn: Turn): Promise<void> {
    this.turns.push(turn);
  }
  async saveCorrections(items: readonly Correction[]): Promise<void> {
    this.savedCorrections.push(...items);
  }
  async saveVocabulary(items: readonly VocabularyItem[]): Promise<void> {
    this.savedVocabulary.push(...items);
  }
  async listTurns(sessionId: string): Promise<Turn[]> {
    return this.turns.filter((turn) => turn.sessionId === sessionId);
  }
  async listCorrections(sessionId: string): Promise<Correction[]> {
    return this.savedCorrections.filter((item) => item.sessionId === sessionId);
  }
  async listVocabulary(sessionId: string): Promise<VocabularyItem[]> {
    return this.savedVocabulary.filter((item) => item.sessionId === sessionId);
  }
  async latestForCharacter(characterId: string): Promise<Session | null> {
    const ended = [...this.items.values()]
      .filter((item) => item.characterId === characterId && item.endedAt !== null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return ended[0] ?? null;
  }
}

class FakeCache implements Cache {
  readonly store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async increment(key: string): Promise<number> {
    const next = ((this.store.get(key) as number | undefined) ?? 0) + 1;
    this.store.set(key, next);
    return next;
  }
}

class FakeTransport implements Transport {
  readonly rooms: string[] = [];
  async createRoom(roomId: string, identity: string) {
    this.rooms.push(`${roomId}:${identity}`);
    return { token: `token-for-${identity}`, url: "wss://example.livekit.cloud" };
  }
}

class FakeBrain implements Brain {
  constructor(private readonly script: readonly string[]) {}
  async *reply(_input: BrainInput): AsyncIterable<BrainChunk> {
    for (const line of this.script) yield { text: line, done: false };
    yield { text: "", done: true };
  }
}

// ---------------------------------------------------------------- fixtures

const character = (overrides: Partial<Character> = {}): Character => ({
  id: "char-1",
  userId: "user-1",
  name: "Leo",
  role: "senior developer",
  personality: "dry humour",
  voiceId: "en-US-GuyNeural",
  accent: "American",
  feedbackStyle: "quiet-tips" as FeedbackStyle,
  savage: false,
  avatarUrl: null,
  defaultTopic: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const turn = (sessionId: string, index: number, speaker: "user" | "character", text: string): Turn => ({
  id: `turn-${index}`,
  sessionId,
  index,
  speaker,
  text,
  createdAt: new Date("2026-10-12T10:00:00Z"),
});

// ---------------------------------------------------------------- createCharacter

describe("createCharacter", () => {
  it("reports every empty field at once, so the form can point at all of them", () => {
    const result = createCharacter("user-1", { name: "  ", role: "" }, { clock: clock(), newId: counter() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.field)).toEqual(["name", "role"]);
  });

  it("rejects a feedback style it does not know", () => {
    const result = createCharacter(
      "user-1",
      { name: "Leo", role: "friend", feedbackStyle: "yell-at-me" },
      { clock: clock(), newId: counter() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]?.field).toBe("feedbackStyle");
  });

  it("picks the voice from the role the user typed", () => {
    const result = createCharacter(
      "user-1",
      { name: "Mira", role: "my old maths teacher" },
      { clock: clock(), newId: counter() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voiceId).toBe("en-US-JennyNeural");
  });

  it("does not override a voice the user chose", () => {
    const result = createCharacter(
      "user-1",
      { name: "Mira", role: "teacher", voiceId: "en-GB-RyanNeural" },
      { clock: clock(), newId: counter() },
    );
    expect(result.ok && result.value.voiceId).toBe("en-GB-RyanNeural");
  });

  it("turns on roasting when the role asks for it", () => {
    const result = createCharacter(
      "user-1",
      { name: "Dan", role: "savage friend" },
      { clock: clock(), newId: counter() },
    );
    expect(result.ok && result.value.savage).toBe(true);
  });

  it("respects the switch even when the role says nothing", () => {
    const result = createCharacter(
      "user-1",
      { name: "Dan", role: "barista", savage: true },
      { clock: clock(), newId: counter() },
    );
    expect(result.ok && result.value.savage).toBe(true);
  });

  it("cleans up spacing and caps long text", () => {
    const result = createCharacter(
      "user-1",
      { name: "  Leo   the   Third  ", role: "friend", personality: "x".repeat(900) },
      { clock: clock(), newId: counter() },
    );
    expect(result.ok && result.value.name).toBe("Leo the Third");
    expect(result.ok && result.value.personality.length).toBe(400);
  });
});

describe("updateCharacter", () => {
  it("keeps the id and the first-seen date", () => {
    const existing = character();
    const result = updateCharacter(existing, { name: "Leo", role: "savage friend" }, { clock: clock(), newId: counter() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(existing.id);
    expect(result.value.createdAt).toBe(existing.createdAt);
    expect(result.value.savage).toBe(true);
  });
});

// ---------------------------------------------------------------- rememberLastCall

describe("rememberLastCall", () => {
  it("returns an empty card when nothing has happened yet", async () => {
    const result = await rememberLastCall({ sessions: new FakeSessions() }, character());
    expect(result.fromSessionId).toBeNull();
    expect(result.card.mistakes).toEqual([]);
  });

  it("rebuilds the card from the last finished call", async () => {
    const sessions = new FakeSessions();
    sessions.items.set("s-old", {
      ...({} as Session),
      id: "s-old",
      userId: "user-1",
      characterId: "char-1",
      startedAt: new Date("2026-10-01T10:00:00Z"),
      endedAt: new Date("2026-10-01T10:10:00Z"),
      durationSec: 600,
      topic: "old call",
      summary: null,
      mood: null,
    });
    sessions.items.set("s-new", {
      ...({} as Session),
      id: "s-new",
      userId: "user-1",
      characterId: "char-1",
      startedAt: new Date("2026-10-11T10:00:00Z"),
      endedAt: new Date("2026-10-11T10:10:00Z"),
      durationSec: 600,
      topic: "job interview practice",
      summary: "We practised past tense.",
      mood: "cheerful",
    });
    await sessions.saveCorrections([
      { id: "c1", sessionId: "s-new", turnId: null, said: "I finish", fixed: "I finished", note: null },
    ]);
    await sessions.saveVocabulary([{ id: "v1", sessionId: "s-new", word: "shipped", meaning: "" }]);

    const result = await rememberLastCall({ sessions }, character());
    expect(result.fromSessionId).toBe("s-new");
    expect(result.card.topic).toBe("job interview practice");
    expect(result.card.mistakes).toEqual(["I finish → I finished"]);
    expect(result.card.newWords).toEqual(["shipped"]);
  });
});

// ---------------------------------------------------------------- startCall

describe("startCall", () => {
  const setup = () => {
    const characters = new FakeCharacters();
    const sessions = new FakeSessions();
    const cache = new FakeCache();
    const transport = new FakeTransport();
    characters.items.set("char-1", character());
    return { characters, sessions, cache, transport };
  };

  const deps = (parts: ReturnType<typeof setup>) => ({
    ...parts,
    clock: clock(),
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });

  it("refuses a character that belongs to someone else", async () => {
    const parts = setup();
    parts.characters.items.set("char-1", character({ userId: "someone-else" }));
    const result = await startCall(deps(parts), {
      userId: "user-1",
      characterId: "char-1",
      identity: "phone-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("character-not-found");
  });

  it("opens a room, saves the session, and leaves a brief for the agent", async () => {
    const parts = setup();
    const result = await startCall(deps(parts), {
      userId: "user-1",
      characterId: "char-1",
      identity: "phone-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.call.token).toBe("token-for-phone-1");
    expect(parts.transport.rooms).toHaveLength(1);
    expect(parts.sessions.items.has(result.call.session.id)).toBe(true);

    const brief = await parts.cache.get<{ systemPrompt: string; voiceId: string; characterName: string }>(
      `duke:session:${result.call.session.id}:brief`,
    );
    expect(brief?.characterName).toBe("Leo");
    expect(brief?.voiceId).toBe("en-US-GuyNeural");
    // The brief carries the *rendered* prompt, so the agent never re-derives the rules.
    expect(brief?.systemPrompt).toContain("You are Leo");
  });

  it("carries what was remembered into the new prompt", async () => {
    const parts = setup();
    const previous: Session = {
      ...({} as Session),
      id: "s-old",
      userId: "user-1",
      characterId: "char-1",
      startedAt: new Date("2026-10-11T10:00:00Z"),
      endedAt: new Date("2026-10-11T10:10:00Z"),
      durationSec: 600,
      topic: "job interview practice",
      summary: "We practised past tense.",
      mood: "cheerful",
    };
    await parts.sessions.save(previous);

    const result = await startCall(deps(parts), {
      userId: "user-1",
      characterId: "char-1",
      identity: "phone-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.rememberedFromSessionId).toBe("s-old");
    const brief = await parts.cache.get<{ systemPrompt: string }>(
      `duke:session:${result.call.session.id}:brief`,
    );
    expect(brief?.systemPrompt).toContain("job interview practice");
  });

  it("starts fresh when the user asked not to continue", async () => {
    const parts = setup();
    await parts.sessions.save({
      ...({} as Session),
      id: "s-old",
      userId: "user-1",
      characterId: "char-1",
      startedAt: new Date("2026-10-11T10:00:00Z"),
      endedAt: new Date("2026-10-11T10:10:00Z"),
      durationSec: 600,
      topic: "job interview practice",
      summary: "We practised past tense.",
      mood: null,
    });

    const result = await startCall(deps(parts), {
      userId: "user-1",
      characterId: "char-1",
      identity: "phone-1",
      continueFromLast: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.rememberedFromSessionId).toBeNull();
  });

  it("refuses before opening a room when the month is used up", async () => {
    const parts = setup();
    await parts.cache.set(usageCounterKey("user-1", "2026-10", "ttsChars"), 10_000_000);

    const result = await startCall(deps(parts), {
      userId: "user-1",
      characterId: "char-1",
      identity: "phone-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("budget-exceeded");
    // The point of checking first: no room, no token, no money spent.
    expect(parts.transport.rooms).toHaveLength(0);
    expect(parts.sessions.items.size).toBe(0);
  });
});

// ---------------------------------------------------------------- endCall

describe("endCall", () => {
  const SUMMARY = JSON.stringify({
    topic: "job interview practice",
    summary: "We practised the past tense and small talk.",
    mistakes: ["I finish → I finished"],
    newWords: ["shipped", "deadline"],
  });

  const setup = (script: readonly string[] = [SUMMARY]) => {
    const sessions = new FakeSessions();
    sessions.items.set("s-1", {
      ...({} as Session),
      id: "s-1",
      userId: "user-1",
      characterId: "char-1",
      startedAt: new Date("2026-10-12T10:00:00Z"),
      endedAt: null,
      durationSec: 0,
      topic: null,
      summary: null,
      mood: null,
    });
    sessions.turns.push(turn("s-1", 0, "user", "I finish the task"));
    sessions.turns.push(turn("s-1", 1, "character", "[[cheerful]] Nice, when did you finish it?"));
    return { sessions, brain: new FakeBrain(script), clock: clock(new Date("2026-10-12T10:07:00Z")), newId: counter() };
  };

  it("summarises the call and writes down what to remember", async () => {
    const parts = setup();
    const result = await endCall(parts, { sessionId: "s-1", characterName: "Leo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.session.endedAt).not.toBeNull();
    expect(result.outcome.session.durationSec).toBe(420);
    expect(result.outcome.session.topic).toBe("job interview practice");
    expect(result.outcome.corrections).toBe(1);
    expect(result.outcome.newWords).toBe(2);
    expect(parts.sessions.savedCorrections[0]?.said).toBe("I finish");
    expect(result.outcome.session.mood).toBe("cheerful");
  });

  it("is safe to call twice — the browser and the agent both race to close", async () => {
    const parts = setup();
    await endCall(parts, { sessionId: "s-1", characterName: "Leo" });
    const correctionsAfterFirst = parts.sessions.savedCorrections.length;

    const second = await endCall(parts, { sessionId: "s-1", characterName: "Leo" });
    expect(second.ok).toBe(true);
    // No second summariser call, so no duplicated corrections.
    expect(parts.sessions.savedCorrections.length).toBe(correctionsAfterFirst);
  });

  it("still ends the call when the summariser misbehaves", async () => {
    const parts = setup(["I am not going to give you JSON.", "Still no."]);
    const result = await endCall(parts, { sessionId: "s-1", characterName: "Leo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.summary).toBeNull();
    expect(result.outcome.session.endedAt).not.toBeNull();
  });

  it("recovers when the second attempt is valid JSON", async () => {
    const parts = setup(["nope, here is a sentence", SUMMARY]);
    const result = await endCall(parts, { sessionId: "s-1", characterName: "Leo" });
    expect(result.ok && result.outcome.summary?.topic).toBe("job interview practice");
  });

  it("can close a call without spending a summariser call", async () => {
    const parts = setup();
    const result = await endCall(parts, { sessionId: "s-1", characterName: "Leo", summarise: false });
    expect(result.ok && result.outcome.summary).toBeNull();
    expect(parts.sessions.savedCorrections).toHaveLength(0);
  });

  it("reports a session that does not exist instead of throwing", async () => {
    const parts = setup();
    const result = await endCall(parts, { sessionId: "missing", characterName: "Leo" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("session-not-found");
  });
});

// A compile-time guard: the fake cache must satisfy the port, not just look like it.
const _cacheCheck: Cache = new FakeCache();
const _memoryCheck: MemoryCard = { characterName: "Leo", topic: null, summary: null, mistakes: [], newWords: [] };
void _cacheCheck;
void _memoryCheck;
