import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CALL_IDLE_SECONDS, IdleWatch, idleSecondsFrom } from "./idle-watch";

describe("IdleWatch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up after the wait, and not before it", () => {
    const onIdle = vi.fn();
    const watch = new IdleWatch(60, { onIdle });

    watch.arm();
    vi.advanceTimersByTime(59_000);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(watch.hasFired).toBe(true);
  });

  it("stays quiet when the learner answers in time", () => {
    const onIdle = vi.fn();
    const watch = new IdleWatch(60, { onIdle });

    watch.arm();
    vi.advanceTimersByTime(30_000); // they started talking
    watch.cancel();
    vi.advanceTimersByTime(300_000);

    expect(onIdle).not.toHaveBeenCalled();
    expect(watch.hasFired).toBe(false);
  });

  it("restarts the wait instead of stacking a second timer", () => {
    const onIdle = vi.fn();
    const watch = new IdleWatch(60, { onIdle });

    watch.arm();
    vi.advanceTimersByTime(50_000);
    watch.arm(); // the character said something else
    vi.advanceTimersByTime(50_000);

    expect(onIdle).not.toHaveBeenCalled(); // only 50s since the restart

    vi.advanceTimersByTime(10_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("never gives up twice, and cannot be armed again once it has", () => {
    const onIdle = vi.fn();
    const watch = new IdleWatch(5, { onIdle });

    watch.arm();
    vi.advanceTimersByTime(5_000);
    watch.arm();
    watch.arm();
    vi.advanceTimersByTime(600_000);

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("is inert when the feature is switched off with 0", () => {
    const onIdle = vi.fn();
    const watch = new IdleWatch(0, { onIdle });

    watch.arm();
    vi.advanceTimersByTime(600_000);

    expect(onIdle).not.toHaveBeenCalled();
  });

  it("cancelling twice is harmless", () => {
    const onIdle = vi.fn();
    const watch = new IdleWatch(60, { onIdle });

    watch.arm();
    watch.cancel();
    watch.cancel();
    vi.advanceTimersByTime(600_000);

    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe("idleSecondsFrom", () => {
  it("reads a number out of the environment file", () => {
    expect(idleSecondsFrom("90")).toBe(90);
  });

  it("treats 0 as off", () => {
    expect(idleSecondsFrom("0")).toBe(0);
  });

  it("falls back on nonsense rather than hanging up on the next tick", () => {
    expect(idleSecondsFrom("sixty")).toBe(DEFAULT_CALL_IDLE_SECONDS);
    // `Number("")` is 0, not NaN. Read as "not set", not as "off" — an emptied line must not
    // silently switch the feature off.
    expect(idleSecondsFrom("")).toBe(DEFAULT_CALL_IDLE_SECONDS);
    expect(idleSecondsFrom("   ")).toBe(DEFAULT_CALL_IDLE_SECONDS);
  });

  it("ignores stray whitespace around the number", () => {
    expect(idleSecondsFrom(" 45 ")).toBe(45);
  });

  it("clamps a negative number to off", () => {
    expect(idleSecondsFrom("-5")).toBe(0);
  });
});
