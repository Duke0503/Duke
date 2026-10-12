/**
 * A recoverable failure with a machine-readable code.
 *
 * Lives in its own module (not `index.ts`) so `config.ts` can import it without a cycle.
 */

export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** A promise-like that must be awaited before the process exits. */
export type Awaitable<T> = T | Promise<T>;
