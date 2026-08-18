import fs from "fs";
import path from "path";
import { BACKUPS_DIR } from "../config/env.js";
import { backupDatabase } from "../database/db.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BACKUPS_KEPT = 10; // ~10 weeks of history at one-per-week

const FILENAME_PATTERN = /^taxpayer-backup-(\d{4}-\d{2}-\d{2})\.db$/;

function todayDateStamp() {
  // Local calendar date, not UTC — so "today" matches what the office
  // actually considers today regardless of timezone offset quirks.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function listBackupFiles() {
  ensureBackupsDir();
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => FILENAME_PATTERN.test(f))
    .sort(); // filenames are YYYY-MM-DD, so lexical sort == chronological
}

/**
 * Creates (or overwrites, if one already exists for today) a dated backup
 * of the SQLite database file. Running this multiple times on the same day
 * — whether via the manual "Create Backup Now" button or the automatic
 * weekly check — always replaces today's file rather than piling up
 * duplicates.
 */
export async function performBackup() {
  ensureBackupsDir();
  const dest = path.join(BACKUPS_DIR, `taxpayer-backup-${todayDateStamp()}.db`);
  // Consistent, single-file snapshot via SQLite's online backup API — safe
  // even while the app is in use, and never misses un-checkpointed WAL data.
  // Overwrites today's file automatically if one already exists.
  await backupDatabase(dest);
  rotateOldBackups();
  return dest;
}

/** Returns the most recent backup's date string (YYYY-MM-DD), or null if none exist. */
export function getLastBackupDate() {
  const files = listBackupFiles();
  if (files.length === 0) return null;
  return files[files.length - 1].match(FILENAME_PATTERN)[1];
}

/**
 * Deletes the oldest backups beyond MAX_BACKUPS_KEPT, so the backups/
 * folder doesn't grow forever on a machine that's never manually cleaned up.
 */
function rotateOldBackups() {
  const files = listBackupFiles();
  if (files.length <= MAX_BACKUPS_KEPT) return;
  const excess = files.slice(0, files.length - MAX_BACKUPS_KEPT);
  for (const file of excess) {
    fs.unlinkSync(path.join(BACKUPS_DIR, file));
  }
}

/**
 * Checks whether 7+ days have passed since the last backup (or no backup
 * exists at all) and, if so, creates one automatically. Intended to be
 * called once on server startup, and periodically thereafter in case the
 * app is ever left running for an extended session.
 *
 * Returns true if a backup was just created, false if it wasn't needed yet.
 */
export async function maybeRunWeeklyBackup() {
  const lastDate = getLastBackupDate();

  if (!lastDate) {
    console.log("[backup] No previous backup found — creating initial backup.");
    await performBackup();
    return true;
  }

  const lastTime = new Date(`${lastDate}T00:00:00`).getTime();
  const elapsed = Date.now() - lastTime;

  if (elapsed >= WEEK_MS) {
    console.log(`[backup] Last backup was ${lastDate} — running scheduled weekly backup.`);
    await performBackup();
    return true;
  }

  return false;
}

/** Returns backup file metadata for display in the UI (name, date, size in bytes). */
export function listBackups() {
  return listBackupFiles()
    .map((filename) => {
      const fullPath = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        date: filename.match(FILENAME_PATTERN)[1],
        sizeBytes: stat.size,
        path: fullPath,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
}