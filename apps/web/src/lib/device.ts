/**
 * Who this phone is.
 *
 * Duke has no login. The browser makes one random id, keeps it in local storage, and sends it
 * on every personal request as `x-device-id`. The API turns it into a user row the first time
 * it sees it. That is enough to keep one person's friends and history together, and there is no
 * password to leak.
 *
 * The id must be **stable**: if it changes, the phone looks like a new person and the friends
 * are gone. So it is only ever created once, and `localStorage` is the only place it lives.
 */

const STORAGE_KEY = "duke.device-id";

/** Set when there is no browser at all (server render, tests). Never sent. */
const PLACEHOLDER = "no-device";

let cached: string | null = null;

function create(): string {
  // `randomUUID` needs a secure context; on plain http it is missing, so keep a fallback.
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (uuid !== undefined) return uuid();

  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function deviceId(): string {
  if (cached !== null) return cached;

  if (typeof window === "undefined") return PLACEHOLDER;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null && saved.length > 0) {
      cached = saved;
      return cached;
    }
    const fresh = create();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return cached;
  } catch {
    // Private mode, or storage switched off. One id for this tab is better than crashing.
    cached = create();
    return cached;
  }
}
