/**
 * Redis `Cache`.
 *
 * Used for three things, all of which save money:
 *   1. a TTL'd copy of each spoken line, so a repeated sentence is not paid for twice,
 *   2. the per-month usage counters that `BudgetGuard` reads,
 *   3. short-lived state during a call (who is speaking, the current mood).
 *
 * A dead Redis must not take the app down: reads fall through to null and writes are
 * allowed to fail, because every one of those three things can be rebuilt.
 */

import type { Cache } from "@duke/core";
import { Redis } from "ioredis";

export interface RedisCacheOptions {
  /** Called instead of throwing when a command fails. */
  readonly onError?: (error: unknown) => void;
}

/** JSON in, JSON out. A value we cannot parse is treated as a miss, not an error. */
const parse = <T>(raw: string | null): T | null => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export class RedisCache implements Cache {
  constructor(
    private readonly redis: Redis,
    private readonly options: RedisCacheOptions = {},
  ) {}

  private report(error: unknown): void {
    this.options.onError?.(error);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return parse<T>(await this.redis.get(key));
    } catch (error) {
      this.report(error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds === undefined) {
        await this.redis.set(key, payload);
      } else {
        await this.redis.set(key, payload, "EX", Math.max(1, Math.round(ttlSeconds)));
      }
    } catch (error) {
      this.report(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.report(error);
    }
  }

  /**
   * Counter for the monthly budget. The TTL is only applied when the key is created, so
   * a rolling window does not keep sliding forward and never expiring.
   */
  async increment(key: string, by = 1, ttlSeconds?: number): Promise<number> {
    try {
      const value = await this.redis.incrby(key, Math.round(by));
      if (ttlSeconds !== undefined && value === Math.round(by)) {
        await this.redis.expire(key, Math.max(1, Math.round(ttlSeconds)));
      }
      return value;
    } catch (error) {
      this.report(error);
      return 0;
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === "PONG";
    } catch (error) {
      this.report(error);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.report(error);
    }
  }
}

/** Build a cache from a `redis://` or `rediss://` URL. Works for local Redis and Upstash. */
export function createRedisCache(url: string, options: RedisCacheOptions = {}): RedisCache {
  const redis = new Redis(url, {
    // Do not retry forever on a bad URL; the fallbacks in RedisCache cover us.
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableOfflineQueue: true,
  });
  // Without a listener, ioredis prints an unhandled error event and crashes the process.
  redis.on("error", (error: unknown) => options.onError?.(error));
  return new RedisCache(redis, options);
}
