// Preload runs in a sandboxed CommonJS context, so it must use require()
// (not ESM import) even though the rest of the project is ESM.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveBackupDialog: (defaultName) =>
    ipcRenderer.invoke("backup:save-dialog", defaultName),
  openBackupDialog: () => ipcRenderer.invoke("backup:open-dialog"),
  copyFile: (source, destination) =>
    ipcRenderer.invoke("backup:copy-file", { source, destination }),
  relaunch: () => ipcRenderer.invoke("app:relaunch"),
});
