/**
 * Real ids.
 *
 * `core` declares the `NewId` type but cannot implement it (it reads no platform globals).
 * This is the implementation the API and the agent hand in.
 */

import { randomUUID } from "node:crypto";
import type { NewId } from "@duke/core";

export const newId: NewId = (): string => randomUUID();
