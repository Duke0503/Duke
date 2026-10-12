/**
 * Starting and ending a call.
 *
 * The start endpoint is the only thing the phone calls before audio begins. It returns a
 * short-lived token, the room address, and a copy of the memory card so the call screen can
 * show what the friend remembers.
 *
 * Note what is NOT returned: the system prompt. The personality goes into Redis for the
 * agent, not to the browser. The phone does not need to know how the character is written,
 * and handing out the prompt would make it trivial to clone someone's friend.
 */

import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  endCall,
  startCall,
  type Brain,
  type Cache,
  type CharacterRepository,
  type Clock,
  type MemoryCard,
  type SessionRepository,
  type SessionSummary,
  type StartedCall,
  type Transport,
} from "@duke/core";
import { newId } from "@duke/adapters";
import { notFound, parseBody, refused } from "../common/http";
import {
  BRAIN,
  CACHE,
  CHARACTER_REPOSITORY,
  CLOCK,
  SESSION_REPOSITORY,
  TRANSPORT,
} from "../platform/tokens";
import { UsageService } from "../usage/usage.service";
import { endCallSchema, startCallSchema } from "./calls.dto";

/** What the phone needs to join the call. */
export interface StartedCallView {
  readonly sessionId: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly roomId: string;
  readonly url: string;
  readonly token: string;
  readonly expiresInSeconds: number;
  readonly memoryCard: MemoryCard;
  readonly rememberedFromSessionId: string | null;
  readonly warning: string | null;
}

export interface EndedCallView {
  readonly sessionId: string;
  readonly endedAt: string;
  readonly durationSec: number;
  readonly topic: string | null;
  readonly summary: string | null;
  readonly mood: string | null;
  readonly corrections: number;
  readonly newWords: number;
  readonly detail: SessionSummary | null;
}

const toView = (call: StartedCall): StartedCallView => ({
  sessionId: call.session.id,
  characterId: call.character.id,
  characterName: call.character.name,
  roomId: call.roomId,
  url: call.url,
  token: call.token,
  expiresInSeconds: call.expiresInSeconds,
  memoryCard: call.memoryCard,
  rememberedFromSessionId: call.rememberedFromSessionId,
  warning: call.warning,
});

@Injectable()
export class CallsService {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TRANSPORT) private readonly transport: Transport,
    @Inject(CACHE) private readonly cache: Cache,
    @Inject(BRAIN) private readonly brain: Brain,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly usage: UsageService,
  ) {}

  async start(userId: string, body: unknown): Promise<StartedCallView> {
    const input = parseBody(startCallSchema, body);

    const result = await startCall(
      {
        characters: this.characters,
        sessions: this.sessions,
        transport: this.transport,
        cache: this.cache,
        clock: this.clock,
        newId,
      },
      {
        userId,
        characterId: input.characterId,
        // Stable per user, so a phone that reconnects replaces its own participant instead
        // of piling up ghost participants in the room.
        identity: `phone-${userId}`,
        continueFromLast: input.continueFromLast,
      },
    );

    if (result.ok) return toView(result.call);

    if (result.kind === "character-not-found") {
      throw notFound("characterId", result.message);
    }
    if (result.kind === "budget-exceeded") {
      throw refused("BUDGET_EXCEEDED", "usage", result.message);
    }
    // LiveKit is unreachable or the credentials are wrong: our problem, not the request's.
    throw new ServiceUnavailableException({
      code: "TRANSPORT_UNAVAILABLE",
      problems: [{ field: "livekit", problem: result.message }],
    });
  }

  async end(userId: string, sessionId: string, body: unknown): Promise<EndedCallView> {
    const session = await this.sessions.getById(sessionId);
    if (session === null || session.userId !== userId) {
      throw notFound("id", "No such call.");
    }

    const input = parseBody(endCallSchema, body) ?? {};
    const character = await this.characters.getById(session.characterId);

    const result = await endCall(
      { sessions: this.sessions, brain: this.brain, clock: this.clock, newId },
      {
        sessionId,
        characterName: character?.name ?? "Them",
        durationSec: input.durationSec,
        summarise: input.summarise,
      },
    );

    if (!result.ok) throw notFound("id", result.message);

    const { outcome } = result;

    // LiveKit bills by the minute and that is the limit we are guarding, so the length of
    // the call is the honest thing to count here.
    await this.usage.addCallSeconds(userId, outcome.session.durationSec);

    return {
      sessionId: outcome.session.id,
      endedAt: (outcome.session.endedAt ?? this.clock.now()).toISOString(),
      durationSec: outcome.session.durationSec,
      topic: outcome.session.topic,
      summary: outcome.session.summary,
      mood: outcome.session.mood,
      corrections: outcome.corrections,
      newWords: outcome.newWords,
      detail: outcome.summary,
    };
  }
}
