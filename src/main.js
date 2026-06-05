const fs = require("node:fs/promises");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHyperframesProject, renderHyperframesProject } = require("./engine/hyperframesProject");
const { gradeQuest } = require("./engine/questGrader");
const { resolveTool } = require("./engine/ffmpegPaths");
const { runProcess } = require("./engine/process");
const questStore = require("./web/lib/questStore");

let mainWindow;

function runsRoot() {
  return process.env.LEGEND_RUNS_DIR || path.join(app.getPath("userData"), "runs");
}

async function probeOutput(filePath) {
  try {
    const { stdout } = await runProcess(resolveTool("ffprobe"), [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration,size:stream=codec_type,width,height,r_frame_rate",
      filePath
    ]);
    return JSON.parse(stdout);
  } catch (error) {
    return { error: error.message };
  }
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
  const onLog = (line) => event.sender.send("job:log", line);
  const result = await renderHyperframesProject(payload, { onLog });
  const output = {
    ...result,
    outputUrl: pathToFileURL(result.outputPath).toString()
  };

  try {
    const planPath = path.join(payload.projectDir, "plan.json");
    const planDoc = JSON.parse(await fs.readFile(planPath, "utf8"));
    const probe = await probeOutput(result.outputPath);
    onLog("Grading output against the request\n");
    output.grade = await gradeQuest(
      {
        prompt: payload.prompt,
        persona: payload.audience,
        sideQuest: payload.sideQuest,
        aspect: payload.aspect,
        targetDuration: payload.targetDuration,
        plan: planDoc.plan,
        finalVideo: result.outputPath,
        totalDuration: planDoc.totalDuration,
        clipCount: (planDoc.timeline || []).length,
        probe
      },
      { onLog }
    );
    onLog(`Grade: ${output.grade.score}/10 (${output.grade.verdict}) via ${output.grade.provider}\n`);
  } catch (error) {
    onLog(`Grading skipped: ${error.message}\n`);
  }

  return output;
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
