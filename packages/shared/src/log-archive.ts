/**
 * Keeps the log folder small.
 *
 * Pino writes one file per day in two folders:
 *
 *   logs/all/duke-api.2026-10-12.1.log      (every line)
 *   logs/error/duke-api.2026-10-12.1.log    (errors only)
 *
 * Days gone by are never written again, so we can safely squeeze them:
 *
 *   1. gzip every finished day into `logs/archive/<same subfolder>/<name>.log.gz`
 *   2. delete the original
 *   3. delete archives older than the retention window
 *
 * Today's files are never touched — pino still holds them open.
 *
 * The archive keeps the same two-folder shape, so `logs/archive/error/` is a gzipped history
 * of everything that ever went wrong — small enough to keep for a long time.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { LOG_DIRNAMES } from "./logger";

export const ARCHIVE_DIRNAME = "archive";
export const DEFAULT_RETENTION_DAYS = 14;

export interface ArchiveOptions {
  /** Folder that holds the daily log folders. */
  readonly logDir: string;
  /** Archives older than this many days are deleted. Default 14. */
  readonly retentionDays?: number;
}

export interface ArchiveReport {
  /** Files that were gzipped, by name. */
  readonly compressed: string[];
  /** Archives that were deleted, by name. */
  readonly deleted: string[];
  /** Files we tried to handle but could not (locked, in use, ...). */
  readonly skipped: string[];
}

const endsWith = (name: string, suffix: string): boolean => name.toLowerCase().endsWith(suffix);

/** Same calendar day, in local time. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** One live folder and the archive folder its days go into. */
interface Stream {
  readonly dir: string;
  readonly archiveDir: string;
}

/**
 * Where logs live and where their archives go.
 *
 * The root is included as well as `all` and `error`: older builds wrote a flat
 * `logs/duke-api.<date>.log`, and a folder that changes shape should still clean up after
 * itself rather than leaving those files behind forever.
 */
function streams(logDir: string): readonly Stream[] {
  const archiveRoot = join(logDir, ARCHIVE_DIRNAME);
  return [
    { dir: logDir, archiveDir: archiveRoot },
    ...LOG_DIRNAMES.map((name) => ({
      dir: join(logDir, name),
      archiveDir: join(archiveRoot, name),
    })),
  ];
}

export async function archiveOldLogs(options: ArchiveOptions): Promise<ArchiveReport> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const now = new Date();
  const report: ArchiveReport = { compressed: [], deleted: [], skipped: [] };
  const all = streams(options.logDir);

  for (const stream of all) {
    const entries = await readdir(stream.dir, { withFileTypes: true }).catch(() => []);
    const logFiles = entries.filter((entry) => entry.isFile() && endsWith(entry.name, ".log"));
    if (logFiles.length === 0) continue;

    // Only create the archive folder once there is something to put in it.
    await mkdir(stream.archiveDir, { recursive: true }).catch(() => {});

    for (const entry of logFiles) {
      const source = join(stream.dir, entry.name);
      try {
        const info = await stat(source);
        // Today's file is still being written to. Leave it alone.
        if (isSameDay(info.mtime, now)) continue;

        const target = join(stream.archiveDir, `${entry.name}.gz`);
        await pipeline(createReadStream(source), createGzip(), createWriteStream(target));
        await rm(source, { force: true });
        report.compressed.push(entry.name);
      } catch {
        // Windows refuses to delete a file another process still holds open.
        // That is fine — we will get it on the next run.
        report.skipped.push(entry.name);
      }
    }
  }

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  for (const stream of all) {
    const archives = await readdir(stream.archiveDir, { withFileTypes: true }).catch(() => []);
    for (const entry of archives) {
      if (!entry.isFile() || !endsWith(entry.name, ".gz")) continue;
      const target = join(stream.archiveDir, entry.name);
      try {
        const info = await stat(target);
        if (info.mtime < cutoff) {
          await rm(target, { force: true });
          report.deleted.push(entry.name);
        }
      } catch {
        report.skipped.push(entry.name);
      }
    }
  }

  return report;
}

/** How often we check for finished days. Six hours is plenty for a daily file. */
export const ARCHIVE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface LogMaintenance {
  /** Runs one archive pass now, then every six hours. */
  readonly stop: () => void;
}

/**
 * Keeps the log folder tidy in the background.
 * Never throws: a failed archive must not take the app down.
 */
export function startLogMaintenance(
  options: ArchiveOptions,
  onReport?: (report: ArchiveReport) => void,
  onError?: (error: unknown) => void,
): LogMaintenance {
  const run = (): void => {
    void archiveOldLogs(options)
      .then((report) => onReport?.(report))
      .catch((error: unknown) => onError?.(error));
  };

  run();
  const timer = setInterval(run, ARCHIVE_INTERVAL_MS);
  // Do not hold the process open just for log housekeeping.
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
