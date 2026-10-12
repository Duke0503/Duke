/**
 * Keeps the log folder small.
 *
 * Pino writes one log file per day (`logs/duke-api.2026-10-12.1.log`). Days gone by
 * are never written again, so we can safely squeeze them:
 *
 *   1. gzip every finished day into `logs/archive/<name>.log.gz`
 *   2. delete the original
 *   3. delete archives older than the retention window
 *
 * Today's file is never touched — it is still open by pino.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

export const ARCHIVE_DIRNAME = "archive";
export const DEFAULT_RETENTION_DAYS = 14;

export interface ArchiveOptions {
  /** Folder that holds the daily log files. */
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

export async function archiveOldLogs(options: ArchiveOptions): Promise<ArchiveReport> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const archiveDir = join(options.logDir, ARCHIVE_DIRNAME);
  const report: ArchiveReport = { compressed: [], deleted: [], skipped: [] };

  const entries = await readdir(options.logDir, { withFileTypes: true }).catch(() => []);
  const logFiles = entries.filter((entry) => entry.isFile() && endsWith(entry.name, ".log"));

  if (logFiles.length > 0 || retentionDays > 0) {
    await mkdir(archiveDir, { recursive: true });
  }

  const now = new Date();

  for (const entry of logFiles) {
    const source = join(options.logDir, entry.name);
    try {
      const info = await stat(source);
      // Today's file is still being written to. Leave it alone.
      if (isSameDay(info.mtime, now)) continue;

      const target = join(archiveDir, `${entry.name}.gz`);
      await pipeline(createReadStream(source), createGzip(), createWriteStream(target));
      await rm(source, { force: true });
      report.compressed.push(entry.name);
    } catch {
      // Windows refuses to delete a file another process still holds open.
      // That is fine — we will get it on the next run.
      report.skipped.push(entry.name);
    }
  }

  const archives = await readdir(archiveDir, { withFileTypes: true }).catch(() => []);
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  for (const entry of archives) {
    if (!entry.isFile() || !endsWith(entry.name, ".gz")) continue;
    const target = join(archiveDir, entry.name);
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
