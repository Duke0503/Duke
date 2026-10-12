/**
 * The opt-out for a route that must answer before anybody has signed in.
 *
 * There are exactly two: `GET /api/health` (a probe that has to work when the app is broken —
 * that is the point of it) and the login itself, which cannot require a session to create one.
 *
 * Everything else is closed by default, because the guard is global: a route added next year is
 * protected because it exists, not because somebody remembered to protect it. Forgetting should
 * fail closed.
 */

import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "duke:is-public";

export const Public = () => SetMetadata(IS_PUBLIC, true);
