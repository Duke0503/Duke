/**
 * A promise-based queue, used to join two loops that run at once.
 *
 * The voice loop has a shape that plain `for await` cannot express: an audio socket is
 * being pushed INTO while transcripts are being pulled OUT. A queue with one writer and one
 * reader is the smallest thing that makes that safe.
 *
 * One writer, one reader. Do not add a second of either.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  readonly #items: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;
  #error: unknown = null;

  /** Add an item. Ignored after close. */
  push(item: T): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter({ value: item, done: false });
      return;
    }
    this.#items.push(item);
  }

  /** No more items. Readers that are waiting finish cleanly. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined as never, done: true });
    }
  }

  /** End the queue with an error. The reader throws it. */
  fail(error: unknown): void {
    this.#error = error;
    this.close();
  }

  get closed(): boolean {
    return this.#closed;
  }

  next(): Promise<IteratorResult<T>> {
    const item = this.#items.shift();
    if (item !== undefined) return Promise.resolve({ value: item, done: false });
    if (this.#error !== null) return Promise.reject(this.#error);
    if (this.#closed) return Promise.resolve({ value: undefined as never, done: true });
    return new Promise<IteratorResult<T>>((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  async return(): Promise<IteratorResult<T>> {
    this.close();
    return { value: undefined as never, done: true };
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}
