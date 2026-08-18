import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "./database/migrate.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import feeOptionRoutes from "./routes/feeOptions.js";
import barangayRoutes from "./routes/barangays.js";
import ownerRoutes from "./routes/owners.js";
import establishmentRoutes from "./routes/establishments.js";
import taxRecordRoutes from "./routes/taxRecords.js";
import paymentRoutes from "./routes/payments.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportRoutes from "./routes/reports.js";
import backupRoutes from "./routes/backup.js";
import activityLogRoutes from "./routes/activityLogs.js";
import { PORT, BACKUPS_DIR, DB_PATH } from "./config/env.js";
import { maybeRunWeeklyBackup } from "./services/backupService.js";
import { ensureDefaultAdmin } from "./database/seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/* ── Auto-backup ──
   Checked once immediately on startup (covers the normal case of the app
   being opened fresh each day/week), and re-checked every 24h thereafter
   in case the app is ever left running continuously for more than a week.
   Both paths are idempotent — maybeRunWeeklyBackup() only actually backs
   up if 7+ days have passed since the last one. */
/* First-run bootstrap: make sure a login exists on a fresh install. */
ensureDefaultAdmin().catch((err) =>
  console.error("[seed] failed to ensure default admin:", err.message)
);

const runAutoBackup = () =>
  maybeRunWeeklyBackup().catch((err) =>
    console.error("[backup] auto-backup failed:", err.message)
  );
runAutoBackup();
setInterval(runAutoBackup, 24 * 60 * 60 * 1000);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/fee-options", feeOptionRoutes);
app.use("/api/barangays", barangayRoutes);
app.use("/api/owners", ownerRoutes);
app.use("/api/establishments", establishmentRoutes);
app.use("/api/tax-records", taxRecordRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/activity-logs", activityLogRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API running at http://127.0.0.1:${PORT}`);
});

export default app;