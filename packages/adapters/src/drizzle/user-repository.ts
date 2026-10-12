/**
 * Postgres-backed `UserRepository`.
 *
 * One statement, not two. `onConflictDoUpdate` with a no-op `set` is the cheapest way to say
 * "insert this device if it is new, otherwise give me the row that is already there" — and
 * because it is a single statement, two requests arriving together on a brand-new device
 * cannot both create a user.
 */

import type { UserRepository } from "@duke/core";
import { AppError } from "@duke/shared";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "./client";
import { users } from "./schema";

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findOrCreateByDevice(deviceId: string): Promise<{ readonly id: string }> {
    const rows = await this.db
      .insert(users)
      .values({ deviceId })
      .onConflictDoUpdate({ target: users.deviceId, set: { deviceId } })
      .returning({ id: users.id });

    const row = rows[0];
    if (row === undefined) {
      throw new AppError("USER_UPSERT", `Could not resolve the user for device ${deviceId}.`);
    }
    return { id: row.id };
  }

  async findByDevice(deviceId: string): Promise<{ readonly id: string } | null> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.deviceId, deviceId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : { id: row.id };
  }
}
