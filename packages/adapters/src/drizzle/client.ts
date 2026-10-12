/**
 * The Postgres connection.
 *
 * Two rules that matter on a free tier:
 *   - a small pool (`max`), because Supabase's free plan runs out of connections long
 *     before it runs out of disk,
 *   - one shared connection per process, not per request.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface Database {
  readonly db: DrizzleDb;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  /** Postgres pool size. */
  readonly maxConnections?: number;
  /** Set false to leave SQL out of the logs. */
  readonly debug?: boolean;
}

export function createDatabase(url: string, options: DatabaseOptions = {}): Database {
  const client = postgres(url, {
    max: options.maxConnections ?? 5,
    // Drizzle already logs what we care about through pino; `notice` is noise.
    onnotice: () => {},
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema, logger: options.debug === true });

  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
