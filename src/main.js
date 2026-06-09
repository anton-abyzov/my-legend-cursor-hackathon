const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const questStore = require("./web/lib/questStore");

let mainWindow;

// NOTE: The desktop shell's edit/render flow was removed in the proof-verifier
// pivot. The product flow (create quest → upload raw proof → AI verify → share)
// now lives in the web app (src/web). The Electron shell still ships the quest
// catalog/browser; rebuilding the verify flow here is a follow-up.

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Legend HyperFrames",
    backgroundColor: "#0a0b0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("videos:select", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose source media",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Media", extensions: ["mp4", "mov", "m4v", "webm", "avi", "mkv", "png", "jpg", "jpeg", "gif", "webp", "heic", "heif"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled) return [];
  return result.filePaths.map((filePath) => ({
    path: filePath,
    name: path.basename(filePath)
  }));
});

// The edit/render/grade pipeline was removed in the proof-verifier pivot. These
// handlers remain registered so the renderer fails loudly (rather than hanging)
// if it still invokes them — the verify flow now lives in the web app.
const EDIT_FLOW_REMOVED = "The desktop edit/render flow was removed. Use the web app (npm run web) for the create → upload → verify → share flow.";
ipcMain.handle("project:generate", async () => {
  throw new Error(EDIT_FLOW_REMOVED);
});
ipcMain.handle("project:render", async () => {
  throw new Error(EDIT_FLOW_REMOVED);
});

ipcMain.handle("quests:recommend", (_event, filters) => questStore.recommend(filters || {}, { limit: 60 }));
ipcMain.handle("quests:browse", (_event, filters) => questStore.list(filters || {}, { limit: 120 }));
ipcMain.handle("quests:daily", (_event, filters) => questStore.dailyQuest(filters || {}));
ipcMain.handle("quests:random", (_event, filters) => questStore.smartRandom(filters || {}));
ipcMain.handle("quests:progress", () => questStore.getProgress());
ipcMain.handle("quests:facets", () => questStore.facets());

ipcMain.handle("path:reveal", async (_event, targetPath) => {
  if (!targetPath) return false;
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle("path:open", async (_event, targetPath) => {
  if (!targetPath) return false;
  await shell.openPath(targetPath);
  return true;
});
