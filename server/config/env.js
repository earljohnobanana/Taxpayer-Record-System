import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

/* ── Where application data (the SQLite DB + backups) lives ──

   This MUST be a per-user, writable location. When the app is packaged
   with Electron, the install folder (Program Files on Windows, the .app
   bundle / asar on macOS) is READ-ONLY. Trying to open/write the SQLite
   database there fails with "attempt to write a readonly database" or an
   EACCES/EROFS permission error — the classic "it works in dev but the
   installed copy can't save anything" bug.

   Resolution order:
     1. TRMS_DATA_DIR env var — set by the Electron main process to
        app.getPath("userData") (e.g. %APPDATA%\<AppName> on Windows).
        This is the correct production path.
     2. Development — keep the repo-local ./database and ./backups folders
        so contributors can inspect the files easily while hacking.
     3. Fallback — the OS-standard per-user application-data directory,
        computed directly. This guarantees we NEVER write into a read-only
        install folder even if, for some reason, the env var wasn't set. */
function osAppDataDir() {
  const appName = "TaxpayerRecordSystem";
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  // Linux / other
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, appName);
}

function resolveDataDir() {
  if (process.env.TRMS_DATA_DIR) return process.env.TRMS_DATA_DIR;
  if (process.env.NODE_ENV === "development") return rootDir;
  return osAppDataDir();
}

export const DATA_DIR = resolveDataDir();

// Ensure the data directory exists up front, before anyone opens the DB.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, "database", "taxpayer.db");
export const BACKUPS_DIR = path.join(DATA_DIR, "backups");

export const JWT_SECRET =
  process.env.JWT_SECRET || "change-this-in-production-santa-catalina-lgu";
export const PORT = Number(process.env.PORT) || 3001;
