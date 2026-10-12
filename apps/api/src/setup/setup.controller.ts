/**
 * "Is Duke ready, and what is left to paste?"
 *
 * These two routes are the whole point of the lazy-adapters design. They answer before any
 * key exists, and they answer without touching a provider. The last step of the project is
 * pasting keys, and this is what tells you which one is still missing.
 *
 * Note what is NOT here: no secrets. A value is only ever echoed back for a variable marked
 * public, so a screenshot of `/api/setup` in a bug report leaks nothing.
 */

import { Controller, Get } from "@nestjs/common";
import {
  ENV_GROUPS,
  REQUIRED_ENV_KEYS,
  inspectEnv,
  summarizeEnv,
  type EnvReport,
} from "@duke/shared";

export interface KeyStatusView {
  readonly key: string;
  readonly label: string;
  readonly where: string;
  readonly example: string | null;
  readonly secret: boolean;
  readonly optional: boolean;
  readonly set: boolean;
  readonly placeholder: boolean;
  /** Only present for non-secret keys. */
  readonly value: string | null;
}

export interface GroupView {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly url: string;
  readonly complete: boolean;
  readonly keys: readonly KeyStatusView[];
}

export interface SetupView {
  readonly ready: boolean;
  readonly summary: string;
  readonly requiredCount: number;
  readonly missing: readonly string[];
  readonly placeholders: readonly string[];
  readonly groups: readonly GroupView[];
}

export interface ReadyView {
  readonly ready: boolean;
  readonly summary: string;
  readonly missing: readonly string[];
  readonly placeholders: readonly string[];
}

const toSetupView = (report: EnvReport): SetupView => ({
  ready: report.ready,
  summary: summarizeEnv(report),
  requiredCount: REQUIRED_ENV_KEYS.length,
  missing: report.missing,
  placeholders: report.placeholders,
  groups: report.groups.map((group) => ({
    id: group.group.id,
    title: group.group.title,
    why: group.group.why,
    url: group.group.url,
    complete: group.complete,
    keys: group.keys.map((key) => ({
      key: key.info.key,
      label: key.info.label,
      where: key.info.where,
      example: key.info.example ?? null,
      secret: key.info.secret,
      optional: key.info.optional === true,
      set: key.set,
      placeholder: key.placeholder,
      value: key.value ?? null,
    })),
  })),
});

@Controller()
export class SetupController {
  /** A tiny "can I be reached" probe. Always true if the process is up. */
  @Get("health")
  health(): { ok: boolean } {
    return { ok: true };
  }

  /** Cheap enough to poll. Says whether the app can actually do anything yet. */
  @Get("ready")
  ready(): ReadyView {
    const report = inspectEnv();
    return {
      ready: report.ready,
      summary: summarizeEnv(report),
      missing: report.missing,
      placeholders: report.placeholders,
    };
  }

  /** The full checklist for the setup screen: every key, and where to copy it from. */
  @Get("setup")
  setup(): SetupView {
    return toSetupView(inspectEnv());
  }
}

/** Kept so the group list is reachable from code that wants the raw shape. */
export const envGroups = ENV_GROUPS;
