const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("legend", {
  selectVideos: () => ipcRenderer.invoke("videos:select"),
  generateProject: (payload) => ipcRenderer.invoke("project:generate", payload),
  renderProject: (payload) => ipcRenderer.invoke("project:render", payload),
  revealPath: (targetPath) => ipcRenderer.invoke("path:reveal", targetPath),
  openPath: (targetPath) => ipcRenderer.invoke("path:open", targetPath),
  quests: {
    recommend: (filters) => ipcRenderer.invoke("quests:recommend", filters),
    browse: (filters) => ipcRenderer.invoke("quests:browse", filters),
    daily: (filters) => ipcRenderer.invoke("quests:daily", filters),
    random: (filters) => ipcRenderer.invoke("quests:random", filters),
    progress: () => ipcRenderer.invoke("quests:progress"),
    facets: () => ipcRenderer.invoke("quests:facets")
  },
  onJobLog: (callback) => {
    const handler = (_event, line) => callback(line);
    ipcRenderer.on("job:log", handler);
    return () => ipcRenderer.removeListener("job:log", handler);
  }
});
