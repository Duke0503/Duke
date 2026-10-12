import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARCHIVE_DIRNAME, archiveOldLogs } from "./log-archive";
import { LOG_ALL_DIRNAME, LOG_ERROR_DIRNAME } from "./logger";

/**
 * This code DELETES files, so it gets tests. The rules that matter most:
 * today's logs are still open by pino and must never be touched, and both streams
 * (all + error) must be swept — it would be easy to forget the second one.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "duke-logs-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Create a log file whose mtime is `daysAgo` days in the past. */
async function writeLog(relative: string, body: string, daysAgo: number): Promise<string> {
  const path = join(dir, relative);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, body, "utf8");
  const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await utimes(path, when, when);
  return path;
}

const gzipMagic = async (path: string): Promise<boolean> => {
  const bytes = await readFile(path);
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
};

describe("archiveOldLogs", () => {
  it("gzips a finished day from the all folder", async () => {
    await writeLog(join(LOG_ALL_DIRNAME, "duke-api.2026-10-11.1.log"), "old line\n", 1);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual(["duke-api.2026-10-11.1.log"]);
    expect(existsSync(join(dir, LOG_ALL_DIRNAME, "duke-api.2026-10-11.1.log"))).toBe(false);
    expect(
      await gzipMagic(join(dir, ARCHIVE_DIRNAME, LOG_ALL_DIRNAME, "duke-api.2026-10-11.1.log.gz")),
    ).toBe(true);
  });

  it("gzips the error folder too, into its own archive folder", async () => {
    await writeLog(join(LOG_ERROR_DIRNAME, "duke-api.2026-10-11.1.log"), "boom\n", 1);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual(["duke-api.2026-10-11.1.log"]);
    expect(
      await gzipMagic(join(dir, ARCHIVE_DIRNAME, LOG_ERROR_DIRNAME, "duke-api.2026-10-11.1.log.gz")),
    ).toBe(true);
  });

  it("keeps the two streams apart, so an error archive is not mixed into the all archive", async () => {
    await writeLog(join(LOG_ALL_DIRNAME, "duke-api.2026-10-10.1.log"), "chatty\n", 2);
    await writeLog(join(LOG_ERROR_DIRNAME, "duke-api.2026-10-10.1.log"), "boom\n", 2);

    await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(existsSync(join(dir, ARCHIVE_DIRNAME, LOG_ALL_DIRNAME, "duke-api.2026-10-10.1.log.gz"))).toBe(true);
    expect(existsSync(join(dir, ARCHIVE_DIRNAME, LOG_ERROR_DIRNAME, "duke-api.2026-10-10.1.log.gz"))).toBe(true);
  });

  it("never touches today's logs in either folder", async () => {
    await writeLog(join(LOG_ALL_DIRNAME, "duke-api.2026-10-12.1.log"), "still being written\n", 0);
    await writeLog(join(LOG_ERROR_DIRNAME, "duke-api.2026-10-12.1.log"), "still being written\n", 0);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual([]);
    expect(existsSync(join(dir, LOG_ALL_DIRNAME, "duke-api.2026-10-12.1.log"))).toBe(true);
    expect(existsSync(join(dir, LOG_ERROR_DIRNAME, "duke-api.2026-10-12.1.log"))).toBe(true);
  });

  it("still cleans up the old flat layout from before the split", async () => {
    await writeLog("duke-api.2026-10-11.1.log", "from an older build\n", 1);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual(["duke-api.2026-10-11.1.log"]);
    expect(await gzipMagic(join(dir, ARCHIVE_DIRNAME, "duke-api.2026-10-11.1.log.gz"))).toBe(true);
  });

  it("does not mistake an archive folder for a live one", async () => {
    // A .gz in the archive folder is not a .log, so it must not be gzipped again.
    await writeLog(join(ARCHIVE_DIRNAME, "duke-api.2026-10-11.1.log.gz"), "already archived", 1);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.compressed).toEqual([]);
  });

  it("deletes archives older than the retention window", async () => {
    const old = await writeLog(join(ARCHIVE_DIRNAME, "duke-api.2026-01-01.1.log.gz"), "x", 30);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.deleted).toEqual(["duke-api.2026-01-01.1.log.gz"]);
    expect(existsSync(old)).toBe(false);
  });

  it("deletes old archives from the error folder as well", async () => {
    const old = await writeLog(join(ARCHIVE_DIRNAME, LOG_ERROR_DIRNAME, "duke-api.2026-01-01.1.log.gz"), "x", 30);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.deleted).toEqual(["duke-api.2026-01-01.1.log.gz"]);
    expect(existsSync(old)).toBe(false);
  });

  it("keeps archives inside the retention window", async () => {
    const recent = await writeLog(join(ARCHIVE_DIRNAME, "duke-api.2026-10-10.1.log.gz"), "x", 2);

    const report = await archiveOldLogs({ logDir: dir, retentionDays: 14 });

    expect(report.deleted).toEqual([]);
    expect(existsSync(recent)).toBe(true);
  });

  it("survives a missing log folder without creating one", async () => {
    const missing = join(dir, "nope");

    const report = await archiveOldLogs({ logDir: missing, retentionDays: 14 });

    expect(report.compressed).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(existsSync(missing)).toBe(false);
  });
});
