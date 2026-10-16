/**
 * The countdown that ends a call nobody is answering.
 *
 * A live call is not free. An open room spends minutes whether or not anyone is talking, and the
 * learner's month is small, so when the character has finished speaking and nothing comes back,
 * something has to give up on the learner's behalf. This is that something.
 *
 * It is a small object with an injectable clock rather than a stray `setTimeout` in the middle of
 * the call code, for one reason: "fires once, exactly once, and never after being cancelled" is
 * the kind of rule that punishes a mistyped edit, and this way it can be tested without a phone,
 * a microphone, or a minute of anyone's time.
 */

export interface IdleWatchOptions {
  /** Called once, when the wait runs out. */
  readonly onIdle: () => void;
  /** Injectable so the tests do not wait a real minute. */
  readonly setTimer?: (handler: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export class IdleWatch {
  private handle: unknown = null;
  private fired = false;

  constructor(
    private readonly seconds: number,
    private readonly options: IdleWatchOptions,
  ) {}

  /**
   * The character has stopped talking and is waiting for an answer: start the countdown, or
   * restart it if one is already running. Cancelling first is part of the contract — a second
   * arm without it would leave the first timer running and fire twice.
   */
  arm(): void {
    if (this.fired || this.seconds <= 0) return;
    this.cancel();

    const setTimer = this.options.setTimer ?? ((handler, ms) => setTimeout(handler, ms));
    this.handle = setTimer(() => {
      this.fired = true;
      this.handle = null;
      this.options.onIdle();
    }, this.seconds * 1000);
  }

  /** Someone spoke, or the character started talking again. Stop the countdown. */
  cancel(): void {
    if (this.handle === null) return;
    const clearTimer = this.options.clearTimer ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    clearTimer(this.handle);
    this.handle = null;
  }

  /** True once it has given up. Nothing re-arms after that. */
  get hasFired(): boolean {
    return this.fired;
  }
}

/** How long a silent call waits before the character says goodbye. `0` turns the feature off. */
export const DEFAULT_CALL_IDLE_SECONDS = 60;

/**
 * Reading `CALL_IDLE_SECONDS` out of `.env`.
 *
 * The guard is the point: `Number("sixty")` is `NaN`, and `setTimeout(handler, NaN)` fires on the
 * next tick. A typo in the environment file would otherwise hang up on the learner the moment
 * they paused to think, which looks exactly like a bug in the call.
 */
export function idleSecondsFrom(raw: string): number {
  const trimmed = raw.trim();

  // An empty value means "not set" — fall back to the default rather than quietly switching the
  // whole feature off. Only a real `0` turns it off.
  if (trimmed.length === 0) return DEFAULT_CALL_IDLE_SECONDS;

  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds)) return DEFAULT_CALL_IDLE_SECONDS;
  return Math.max(0, seconds);
}
