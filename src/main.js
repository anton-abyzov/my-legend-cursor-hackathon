const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHyperframesProject, renderHyperframesProject } = require("./engine/hyperframesProject");
const questStore = require("./web/lib/questStore");

let mainWindow;

function runsRoot() {
  return process.env.LEGEND_RUNS_DIR || path.join(app.getPath("userData"), "runs");
}

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
    title: "Choose source videos",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Video", extensions: ["mp4", "mov", "m4v", "webm", "avi", "mkv"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled) return [];
  return result.filePaths.map((filePath) => ({
    path: filePath,
    name: path.basename(filePath)
  }));
});

ipcMain.handle("project:generate", async (event, payload) => {
  const outputRoot = runsRoot();
  const result = await createHyperframesProject(
    { ...payload, outputRoot },
    {
      onLog: (line) => event.sender.send("job:log", line)
    }
  );
  return {
    ...result,
    indexUrl: pathToFileURL(result.indexPath).toString()
  };
});

ipcMain.handle("project:render", async (event, payload) => {
  const result = await renderHyperframesProject(payload, {
    onLog: (line) => event.sender.send("job:log", line)
  });
  return {
    ...result,
    outputUrl: pathToFileURL(result.outputPath).toString()
  };
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
