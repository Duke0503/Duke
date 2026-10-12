/**
 * The phone line — LiveKit.
 *
 * Two credentials are made here, and they are different things:
 *
 *   1. a **join token** for the browser. Short lived, and scoped to exactly one room. This
 *      is why the API server holds the secret and the phone never does.
 *   2. a **room with an agent dispatch**, so LiveKit wakes our worker and puts it in the
 *      same room. Without this the user would be talking to an empty call.
 *
 * LiveKit Cloud auto-creates a room the moment anyone joins, so a failure to pre-create is
 * only a problem if it hides a real error — which is why "already exists" is swallowed and
 * nothing else is.
 */

import type { Transport } from "@duke/core";
import { AppError, optionalEnv, requireEnv } from "@duke/shared";
import { AccessToken, RoomAgentDispatch, RoomServiceClient } from "livekit-server-sdk";

const DEFAULT_TOKEN_TTL_SECONDS = 900;

/**
 * The name the worker registers under, and the name the API asks LiveKit to dispatch.
 *
 * Exported because **both ends have to agree on it, and LiveKit does not tell you when they do
 * not.** The API creates each room with `RoomAgentDispatch({ agentName })`; if the worker
 * registered under a different name — or under none at all — the room is created, the phone
 * connects, the learner talks, and nothing ever answers. No error, on either side.
 *
 * The agents SDK falls back to its own `LIVEKIT_AGENT_NAME` lookup and, failing that, to the
 * empty string, so the agent passes this constant in explicitly rather than trusting the
 * environment to be set the same way twice.
 */
export const DEFAULT_AGENT_NAME = "duke";

/** Keep an empty room alive 10 minutes: long enough to reload the page and come back. */
const EMPTY_ROOM_TIMEOUT_SECONDS = 600;

export interface LiveKitTransportOptions {
  readonly url?: string;
  readonly apiKey?: string;
  readonly apiSecret?: string;
  readonly tokenTtlSeconds?: number;
  readonly agentName?: string;
  readonly onError?: (error: unknown) => void;
}

export interface RoomCredentials {
  readonly roomId: string;
  readonly token: string;
  readonly url: string;
  readonly expiresInSeconds: number;
}

/** The REST API lives on https even though the audio socket is wss. */
const toHttpUrl = (url: string): string =>
  url.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");

const isAlreadyExists = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|409/i.test(message);
};

export class LiveKitTransport implements Transport {
  constructor(private readonly options: LiveKitTransportOptions = {}) {}

  private url(): string {
    return this.options.url ?? requireEnv("LIVEKIT_URL");
  }

  private apiKey(): string {
    return this.options.apiKey ?? requireEnv("LIVEKIT_API_KEY");
  }

  private apiSecret(): string {
    return this.options.apiSecret ?? requireEnv("LIVEKIT_API_SECRET");
  }

  private ttl(): number {
    return (
      this.options.tokenTtlSeconds ??
      Number(optionalEnv("LIVEKIT_TOKEN_TTL", String(DEFAULT_TOKEN_TTL_SECONDS)))
    );
  }

  private agentName(): string {
    return this.options.agentName ?? optionalEnv("LIVEKIT_AGENT_NAME", DEFAULT_AGENT_NAME);
  }

  private roomClient(): RoomServiceClient {
    return new RoomServiceClient(toHttpUrl(this.url()), this.apiKey(), this.apiSecret());
  }

  /** Hand the browser a token that only opens this one room. */
  async createRoom(roomId: string, identity: string): Promise<RoomCredentials> {
    const ttl = this.ttl();
    await this.ensureRoom(roomId);

    const token = new AccessToken(this.apiKey(), this.apiSecret(), {
      identity,
      name: identity,
      ttl,
    });
    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      roomId,
      token: await token.toJwt(),
      url: this.url(),
      expiresInSeconds: ttl,
    };
  }

  /** Create the room and ask LiveKit to send our agent into it. */
  async ensureRoom(roomId: string): Promise<void> {
    try {
      await this.roomClient().createRoom({
        name: roomId,
        emptyTimeout: EMPTY_ROOM_TIMEOUT_SECONDS,
        agents: [new RoomAgentDispatch({ agentName: this.agentName() })],
      });
    } catch (error) {
      if (isAlreadyExists(error)) {
        this.options.onError?.(error);
        return;
      }
      throw new AppError(
        "LIVEKIT_ROOM",
        `Could not create room ${roomId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async endRoom(roomId: string): Promise<void> {
    try {
      await this.roomClient().deleteRoom(roomId);
    } catch (error) {
      // Closing an already-closed room is not worth failing a call over.
      this.options.onError?.(error);
    }
  }

  /** Cheap credential check for the doctor command. */
  async check(): Promise<void> {
    try {
      await this.roomClient().listRooms();
    } catch (error) {
      throw new AppError(
        "LIVEKIT_AUTH",
        `LiveKit rejected the credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
