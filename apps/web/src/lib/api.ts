/**
 * The one place the browser talks to the API.
 *
 * Two rules, both about mistakes being visible:
 *
 *   1. Every request carries the anonymous device id, so the API can find the person's
 *      friends and history. `DeviceUserGuard` rejects a request without one.
 *   2. A failure is thrown as an `ApiError` carrying the API's own `code` and `problems`.
 *      The API answers every error with one shape (see `docs/architecture.md` §11), and the
 *      screens show `problems[].problem` — which is written for a human — rather than
 *      "Request failed with status 400".
 *
 * Requests go to `/api` on our own origin. In development Next.js proxies that to the API
 * (see `next.config.ts`); in production Caddy does. The browser never needs to know the API's
 * address, and there is no cross-origin request to get wrong.
 */

import { deviceId } from "./device";

export const API_BASE = "/api";

export interface FieldProblem {
  readonly field: string;
  readonly problem: string;
}

/** One error shape, whatever went wrong. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly problems: readonly FieldProblem[],
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** What to put in front of the user: the first real problem, or the message. */
  get detail(): string {
    return this.problems[0]?.problem ?? this.message;
  }
}

interface ErrorBody {
  readonly statusCode?: number;
  readonly code?: string;
  readonly message?: string;
  readonly problems?: readonly FieldProblem[];
  readonly requestId?: string;
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null;
}

interface RequestOptions {
  readonly method?: string;
  /** Serialised as JSON. Omit for no body (a DELETE has none). */
  readonly json?: unknown;
  readonly signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "x-device-id": deviceId() };
  let body: string | undefined;

  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    // Offline, or the API is down. Say that, rather than "Failed to fetch".
    throw new ApiError(
      0,
      "NETWORK",
      "Could not reach Duke. Is the server running?",
      [],
      null,
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errorBody = isErrorBody(parsed) ? parsed : {};
    throw new ApiError(
      response.status,
      errorBody.code ?? "UNKNOWN",
      errorBody.message ?? `Request failed (${response.status}).`,
      errorBody.problems ?? [],
      errorBody.requestId ?? response.headers.get("x-request-id"),
    );
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal): Promise<T> =>
    request<T>(path, signal === undefined ? {} : { signal }),
  post: <T>(path: string, json?: unknown): Promise<T> => request<T>(path, { method: "POST", json }),
  patch: <T>(path: string, json?: unknown): Promise<T> => request<T>(path, { method: "PATCH", json }),
  delete: (path: string): Promise<void> => request<void>(path, { method: "DELETE" }),
};

/**
 * Close the books when the tab goes away.
 *
 * `pagehide` fires on a swipe-away and on a phone locking, and an ordinary fetch is cancelled
 * the moment the page is gone. `keepalive` lets this one finish in the background, so a
 * closed tab does not leave an open session behind.
 *
 * Fire and forget on purpose: there is nothing left to show the result to.
 */
export function endCallOnUnload(sessionId: string, durationSec: number): void {
  void fetch(`${API_BASE}/calls/${sessionId}/end`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": deviceId() },
    body: JSON.stringify({ durationSec }),
    keepalive: true,
  }).catch(() => undefined);
}
