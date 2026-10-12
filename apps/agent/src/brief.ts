/**
 * Reading the session brief.
 *
 * The API writes the prompt, the voice and the memory for a call into Redis before it hands
 * the phone a join token. The agent's only job at the start of a call is to find it again.
 *
 * The room name is the key: the API opens `duke-<sessionId>`, so the session id is in the
 * name already and nothing else has to be passed through LiveKit.
 */

import { sessionBriefKey, type Cache, type SessionBrief } from "@duke/core";

export const ROOM_PREFIX = "duke-";

/** `duke-abc` -> `abc`. `null` for a room Duke did not open. */
export function sessionIdFromRoom(roomName: string): string | null {
  if (!roomName.startsWith(ROOM_PREFIX)) return null;
  const id = roomName.slice(ROOM_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** The brief, or `null` when the room is not ours or the brief has expired. */
export async function readBrief(cache: Cache, roomName: string): Promise<SessionBrief | null> {
  const sessionId = sessionIdFromRoom(roomName);
  if (sessionId === null) return null;

  const brief = await cache.get<SessionBrief>(sessionBriefKey(sessionId));
  // The key could in theory hold another session's brief. Believe the value, not the key.
  return brief?.sessionId === sessionId ? brief : null;
}
