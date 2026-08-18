import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { DB_PATH } from "../config/env.js";

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/* ── Fail fast with a clear message if the DB folder isn't writable ──
   Far better to surface "the app can't write to <folder>" on startup than
   to let every save silently throw a cryptic SQLite error later. */
try {
  fs.accessSync(dbDir, fs.constants.W_OK);
} catch {
  throw new Error(
    `Database folder is not writable: ${dbDir}. ` +
      `The application cannot save data here. This usually means the app was ` +
      `installed to a read-only location — data must live in a per-user folder.`
  );
}

/* Where a restore is staged. The /backup/restore route copies the chosen
   backup here (it can't overwrite the live, locked database directly), and the
   swap below applies it on the NEXT startup, before the database is opened. */
export const PENDING_RESTORE_PATH = `${DB_PATH}.restore-pending`;

/* ── Apply a staged restore, if one exists ──
   Runs BEFORE the database connection is opened, so nothing is locking the
   files and the swap is safe on Windows. We replace the main .db file with the
   staged backup and remove the old -wal/-shm sidecars (leaving a stale -wal
   would make SQLite replay old data over the restored file). */
function applyPendingRestore() {
  if (!fs.existsSync(PENDING_RESTORE_PATH)) return;
  try {
    for (const ext of ["-wal", "-shm"]) {
      const sidecar = `${DB_PATH}${ext}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    fs.renameSync(PENDING_RESTORE_PATH, DB_PATH);
    console.log("[db] Applied staged database restore.");
  } catch (err) {
    console.error("[db] Failed to apply staged restore:", err.message);
    // Leave the pending file in place so it can be retried next launch rather
    // than silently lost.
  }
}

applyPendingRestore();

const sqlite = new Database(DB_PATH);

/* ── Production tuning for a single-PC, offline desktop app ──

   journal_mode = WAL
     Write-Ahead Logging. Writers no longer block readers, commits are
     much faster than the default rollback journal, and WAL is more
     resilient to a sudden process kill (power loss, forced Windows
     update restart, Electron crash) than the default journal mode —
     it recovers cleanly on next open instead of leaving a corrupt DB.

   synchronous = NORMAL
     Safe to pair with WAL. Skips an fsync on every single transaction
     (which the default FULL setting does) while still guaranteeing the
     database file itself can't be corrupted by an app crash — only a
     full OS-level power failure could lose the last commit, which is an
     acceptable tradeoff for a desktop app and dramatically speeds up
     writes (payments, tax records, etc. feel instant instead of laggy).

   busy_timeout = 5000
     If the Express server and any other process (e.g. a backup copy
     mid-flight) briefly touch the DB file at the same moment, SQLite
     will wait up to 5s and retry instead of immediately throwing
     "database is locked" errors back to the user.

   foreign_keys = ON
     Already present — kept as-is, enforces referential integrity. */
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

/**
 * Produces a consistent, single-file snapshot of the live database.
 *
 * We deliberately do NOT plain-copy the .db file: in WAL mode the newest
 * transactions live in the separate `<db>-wal` file and have not yet been
 * merged into the main file, so a raw file copy can silently miss the most
 * recent payments/records. SQLite's online backup API copies the fully
 * merged, transactionally-consistent state — safely, even while the app is
 * actively using the database.
 *
 * @param {string} destination absolute path to write the snapshot to
 * @returns {Promise<void>}
 */
export function backupDatabase(destination) {
  return sqlite.backup(destination);
}

/** Folds the WAL back into the main .db file. Called before shutdown so the
    on-disk file is always complete and self-contained. */
export function checkpointDatabase() {
  try {
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.error("[db] checkpoint failed:", err.message);
  }
}

/* ── Graceful shutdown ──
   Checkpoint + close on exit so the database is never left mid-WAL. Guarded
   so it only runs once even if several signals fire. */
let closed = false;
function shutdown() {
  if (closed) return;
  closed = true;
  checkpointDatabase();
  try {
    sqlite.close();
  } catch {
    /* already closed */
  }
}
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

export const db = drizzle(sqlite, { schema });
export { sqlite };
