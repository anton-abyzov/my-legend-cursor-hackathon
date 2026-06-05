const state = {
  videos: [],
  project: null,
  render: null,
  busy: false
};

const els = {
  selectVideos: document.getElementById("selectVideos"),
  videoList: document.getElementById("videoList"),
  videoCount: document.getElementById("videoCount"),
  audience: document.getElementById("audience"),
  targetDuration: document.getElementById("targetDuration"),
  aspect: document.getElementById("aspect"),
  quality: document.getElementById("quality"),
  prompt: document.getElementById("prompt"),
  generateProject: document.getElementById("generateProject"),
  renderProject: document.getElementById("renderProject"),
  revealProject: document.getElementById("revealProject"),
  revealRender: document.getElementById("revealRender"),
  cutPlan: document.getElementById("cutPlan"),
  previewSlot: document.getElementById("previewSlot"),
  logOutput: document.getElementById("logOutput"),
  clearLog: document.getElementById("clearLog")
};

function appendLog(line) {
  els.logOutput.textContent += line;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function setBusy(value) {
  state.busy = value;
  els.generateProject.disabled = value || state.videos.length === 0;
  els.renderProject.disabled = value || !state.project;
  els.selectVideos.disabled = value;
  document.body.classList.toggle("is-busy", value);
}

function renderVideos() {
  els.videoCount.textContent = String(state.videos.length);

  if (!state.videos.length) {
    els.videoList.className = "video-list empty";
    els.videoList.textContent = "No videos selected";
    setBusy(state.busy);
    return;
  }

  els.videoList.className = "video-list";
  els.videoList.innerHTML = state.videos
    .map((video, index) => `
      <div class="video-item">
        <div class="video-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="video-name" title="${escapeHtml(video.path)}">${escapeHtml(video.name)}</div>
      </div>
    `)
    .join("");

  setBusy(state.busy);
}

function renderCutPlan(project) {
  if (!project) {
    els.cutPlan.className = "cut-plan empty";
    els.cutPlan.textContent = "No project generated yet";
    return;
  }

  els.cutPlan.className = "cut-plan";
  els.cutPlan.innerHTML = project.clips
    .map((clip) => `
      <div class="cut-row">
        <div class="cut-time">${clip.start.toFixed(1)}s</div>
        <div class="cut-name" title="${escapeHtml(clip.sourceName)}">${escapeHtml(clip.sourceName)}</div>
        <div class="cut-duration">${clip.duration.toFixed(1)}s</div>
      </div>
    `)
    .join("");
}

function renderPreview(render) {
  if (!render) {
    els.previewSlot.innerHTML = '<div class="preview-empty">Render output appears here</div>';
    return;
  }

  els.previewSlot.innerHTML = `
    <video controls src="${render.outputUrl}"></video>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function payload() {
  return {
    videoPaths: state.videos.map((video) => video.path),
    prompt: els.prompt.value,
    audience: els.audience.value,
    aspect: els.aspect.value,
    targetDuration: Number(els.targetDuration.value) || 30
  };
}

els.selectVideos.addEventListener("click", async () => {
  const videos = await window.legend.selectVideos();
  if (!videos.length) return;
  state.videos = videos;
  state.project = null;
  state.render = null;
  renderVideos();
  renderCutPlan(null);
  renderPreview(null);
  els.revealProject.disabled = true;
  els.revealRender.disabled = true;
});

els.generateProject.addEventListener("click", async () => {
  setBusy(true);
  appendLog("\n--- Generate project ---\n");
  try {
    const project = await window.legend.generateProject(payload());
    state.project = project;
    state.render = null;
    renderCutPlan(project);
    renderPreview(null);
    els.revealProject.disabled = false;
    els.revealRender.disabled = true;
    appendLog(`Ready: ${project.projectDir}\n`);
  } catch (error) {
    appendLog(`Error: ${error.message}\n`);
  } finally {
    setBusy(false);
  }
});

els.renderProject.addEventListener("click", async () => {
  if (!state.project) return;
  setBusy(true);
  appendLog("\n--- Render MP4 ---\n");
  try {
    const render = await window.legend.renderProject({
      projectDir: state.project.projectDir,
      quality: els.quality.value,
      fps: 30
    });
    state.render = render;
    renderPreview(render);
    els.revealRender.disabled = false;
    appendLog(`Rendered: ${render.outputPath}\n`);
  } catch (error) {
    appendLog(`Error: ${error.message}\n`);
  } finally {
    setBusy(false);
  }
});

els.revealProject.addEventListener("click", () => {
  if (state.project) window.legend.revealPath(state.project.indexPath);
});

els.revealRender.addEventListener("click", () => {
  if (state.render) window.legend.revealPath(state.render.outputPath);
});

els.clearLog.addEventListener("click", () => {
  els.logOutput.textContent = "";
});

window.legend.onJobLog((line) => appendLog(line));
renderVideos();
renderCutPlan(null);
renderPreview(null);
