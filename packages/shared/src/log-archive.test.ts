import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARCHIVE_DIRNAME, archiveOldLogs } from "./log-archive";

/**
 * This code DELETES files, so it gets tests. The rule that matters most:
 * today's log is still open by pino and must never be touched.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "duke-logs-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Create a log file whose mtime is `daysAgo` days in the past. */
async function writeLog(name: string, body: string, daysAgo: number): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, body, "utf8");
  const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await utimes(path, when, when);
  return path;
}

describe("archiveOldLogs", () => {
  it("gzips a finished day and removes the original", async () => {
    await writeLog("duke-api.2026-10-11.1.log", "old line\n", 1);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual(["duke-api.2026-10-11.1.log"]);
    expect(existsSync(join(dir, "duke-api.2026-10-11.1.log"))).toBe(false);

    const archived = await readFile(join(dir, ARCHIVE_DIRNAME, "duke-api.2026-10-11.1.log.gz"));
    expect(archived[0]).toBe(0x1f); // gzip magic bytes
    expect(archived[1]).toBe(0x8b);
  });

  it("never touches today's log", async () => {
    await writeLog("duke-api.2026-10-12.1.log", "still being written\n", 0);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual([]);
    expect(existsSync(join(dir, "duke-api.2026-10-12.1.log"))).toBe(true);
  });

  it("deletes archives older than the retention window", async () => {
    await mkdir(join(dir, ARCHIVE_DIRNAME), { recursive: true });
    const old = await writeLog(join(ARCHIVE_DIRNAME, "duke-api.2026-01-01.1.log.gz"), "x", 30);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.deleted).toEqual(["duke-api.2026-01-01.1.log.gz"]);
    expect(existsSync(old)).toBe(false);
  });

  it("keeps archives inside the retention window", async () => {
    await mkdir(join(dir, ARCHIVE_DIRNAME), { recursive: true });
    const recent = await writeLog(join(ARCHIVE_DIRNAME, "duke-api.2026-10-10.1.log.gz"), "x", 2);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.deleted).toEqual([]);
    expect(existsSync(recent)).toBe(true);
  });

  it("survives a missing log folder", async () => {
    const report = await archiveOldLogs({ logDir: join(dir, "nope"), retentionDays: 14 });

    expect(report.compressed).toEqual([]);
    expect(report.deleted).toEqual([]);
  });
});
