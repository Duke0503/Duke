/**
 * The real clock.
 *
 * `Clock` is a port so the budget rules and the "is this month over?" logic can be tested
 * without waiting for time to pass.
 */

import type { Clock } from "@duke/core";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * A clock you can move by hand. Used by tests, and by the offline demo mode where the
 * whole call runs against recordings instead of a live room.
 */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
