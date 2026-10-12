import { describe, expect, it } from "vitest";
import { AsyncQueue } from "./async-queue";
import { lazyProxy } from "./lazy-proxy";

describe("AsyncQueue", () => {
  it("delivers items pushed before anyone reads", async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.close();

    const seen: number[] = [];
    for await (const value of queue) seen.push(value);
    expect(seen).toEqual([1, 2]);
  });

  it("hands an item straight to a reader that is already waiting", async () => {
    const queue = new AsyncQueue<string>();
    const pending = queue.next();
    queue.push("late");
    await expect(pending).resolves.toEqual({ value: "late", done: false });
  });

  it("finishes cleanly on close", async () => {
    const queue = new AsyncQueue<number>();
    queue.close();
    await expect(queue.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("rejects the reader when the producer fails", async () => {
    const queue = new AsyncQueue<number>();
    queue.fail(new Error("socket died"));
    await expect(queue.next()).rejects.toThrow("socket died");
  });

  it("wakes every waiter on close", async () => {
    const queue = new AsyncQueue<number>();
    const a = queue.next();
    const b = queue.next();
    queue.close();
    await expect(Promise.all([a, b])).resolves.toEqual([
      { value: undefined, done: true },
      { value: undefined, done: true },
    ]);
  });

  it("ignores writes after close, so a late socket event is harmless", () => {
    const queue = new AsyncQueue<number>();
    queue.close();
    queue.push(99);
    expect(queue.closed).toBe(true);
  });
});

describe("lazyProxy", () => {
  it("does not build the service until a method is called", () => {
    let built = 0;
    const service = lazyProxy(() => {
      built += 1;
      return { greet: (name: string) => `hi ${name}` };
    });

    expect(built).toBe(0);
    expect(service.greet("Leo")).toBe("hi Leo");
    expect(built).toBe(1);
    // Built once, reused after that.
    service.greet("Mira");
    expect(built).toBe(1);
  });

  it("keeps `this` bound inside the real object", () => {
    const service = lazyProxy(() => ({
      count: 0,
      bump(): number {
        this.count += 1;
        return this.count;
      },
    }));
    expect(service.bump()).toBe(1);
    expect(service.bump()).toBe(2);
  });

  it("surfaces the missing-key error at the first real call, not at construction", () => {
    const service = lazyProxy<{ go(): void }>(() => {
      throw new Error("MISSING_KEY is not set. Add it to your .env file.");
    });
    expect(() => service.go()).toThrow(/MISSING_KEY is not set/);
  });

  it("stays undefined for `then`, so it is never mistaken for a promise", () => {
    const service = lazyProxy(() => ({ go: () => 1 }));
    expect((service as { then?: unknown }).then).toBeUndefined();
  });
});
