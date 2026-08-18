import { app, BrowserWindow, Menu, ipcMain, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const SERVER_PORT = Number(process.env.PORT) || 3001;
const HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/api/health`;

/* ── Tell the backend where to keep its data ──
   app.getPath("userData") is a guaranteed-writable per-user folder
   (e.g. %APPDATA%\<AppName> on Windows). The Express server reads this via
   the TRMS_DATA_DIR env var (see server/config/env.js) and stores the
   SQLite database + backups there, instead of inside the read-only install
   folder. Must be set before the server module is imported so env.js picks
   it up. In dev, the server runs as a separate npm process and uses the
   repo-local folder, so we leave this unset. */
if (!isDev) {
  process.env.NODE_ENV = "production";
  process.env.TRMS_DATA_DIR = app.getPath("userData");
}

/* ── Run the Express backend INSIDE the Electron main process (production) ──
   For a single-PC offline app this is simpler and more robust than spawning
   a separate Node process: no bundled Node runtime needed, the native
   better-sqlite3 module loads once in this process, and there's nothing to
   orphan if the app crashes. In development the backend is started
   separately by `npm run dev:server`, so we skip this. */
async function startBackend() {
  if (isDev) return;
  await import("../server/index.js");
}

/* Poll the health endpoint until the server is accepting requests, so the
   window never loads the UI before the API can answer its first fetch. */
async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/* ── Application menu ──
   Replaces Electron's default developer-oriented menu with a minimal,
   professional one suited to office staff. The "Developer" submenu (reload,
   force-reload, DevTools) is included ONLY in development builds, so the
   packaged app staff use does not expose those tools. Standard Edit
   accelerators (copy/paste/undo/select-all) are kept because forms rely on
   them. */
function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit", label: "Exit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "About",
              message: "Taxpayer Record Management System",
              detail:
                `Municipal Treasurer's Office\n` +
                `Santa Catalina, Negros Oriental\n\n` +
                `Version ${app.getVersion()}`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];

  // Developer tools — development builds only.
  if (isDev) {
    template.push({
      label: "Developer",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "Taxpayer Record Management System",
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../client/dist/index.html"));
  }
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    if (!isDev) {
      const ok = await waitForServer();
      if (!ok) {
        dialog.showErrorBox(
          "Startup Error",
          "The application backend did not start in time. Please close and reopen the app. If the problem persists, contact your system administrator."
        );
      }
    }
  } catch (err) {
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start the application backend:\n\n${err?.message || err}`
    );
  }

  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("backup:save-dialog", async (_event, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
  });
  return canceled ? null : filePath;
});

ipcMain.handle("backup:open-dialog", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
    properties: ["openFile"],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("backup:copy-file", async (_event, { source, destination }) => {
  await fs.promises.copyFile(source, destination);
  return true;
});

/* Restart the app — used to apply a staged database restore. */
ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
});
