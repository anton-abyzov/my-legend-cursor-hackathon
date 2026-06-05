const config = window.LEGEND_CONFIG || { basePath: "" };
const basePath = config.basePath || "";

const state = {
  user: null,
  jobs: [],
  filter: "all",
  activeJobId: null,
  pollTimer: null
};

const els = {
  sessionState: document.querySelector("#sessionState"),
  logoutButton: document.querySelector("#logoutButton"),
  questForm: document.querySelector("#questForm"),
  submitButton: document.querySelector("#submitButton"),
  videoInput: document.querySelector("#videoInput"),
  uploadMeta: document.querySelector("#uploadMeta"),
  historyList: document.querySelector("#historyList"),
  refreshHistory: document.querySelector("#refreshHistory"),
  jobStatus: document.querySelector("#jobStatus"),
  verificationGrid: document.querySelector("#verificationGrid"),
  outputVideo: document.querySelector("#outputVideo"),
  outputLink: document.querySelector("#outputLink"),
  logTail: document.querySelector("#logTail"),
  loginGate: document.querySelector("#loginGate"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError")
};

function apiPath(path) {
  return `${basePath}${path}`;
}

async function api(path, options = {}) {
  const response = await fetch(apiPath(path), {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "string" ? body : body.message || body.error || "Request failed";
    throw new Error(message);
  }

  return body;
}

function formValue(name) {
  return new FormData(els.questForm).get(name);
}

function generatedPrompt() {
  const title = formValue("title") || "Side quest";
  const persona = formValue("persona") || "Gen Z";
  const sideQuest = formValue("sideQuest") || "Hackathon proof";
  const style = formValue("style") || "fast viral proof";
  const aspectLabel = els.questForm.elements.aspect.selectedOptions[0]?.textContent || "Vertical 9:16";
  const targetDuration = formValue("targetDuration") || "18";

  return [
    `Build a ${targetDuration}s ${aspectLabel} HyperFrames edit called "${title}".`,
    `Audience: ${persona}. Side quest: ${sideQuest}. Style: ${style}.`,
    "Select the strongest audible moments, remove silence, avoid duplicate source clips, and keep the proof obvious.",
    "Use kinetic labels, a visible progress rail, and short captions that explain why each beat matters.",
    "End with a clear payoff frame that makes the demo feel shipped, not described."
  ].join("\n");
}

function syncPrompt() {
  els.questForm.elements.prompt.value = generatedPrompt();
}

function fileSizeLabel(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function updateUploadMeta() {
  const files = Array.from(els.videoInput.files || []);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  els.uploadMeta.textContent = files.length ? `${files.length} file${files.length === 1 ? "" : "s"} / ${fileSizeLabel(total)}` : "No files selected";
}

function statusLabel(job) {
  if (!job) return "No active render";
  if (job.status === "complete") return "Complete";
  if (job.status === "failed") return "Failed";
  if (job.status === "processing") return "Rendering";
  return "Queued";
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value || "-"}</strong></div>`;
}

function renderVerification(job) {
  if (!job) {
    els.verificationGrid.innerHTML = "";
    els.outputVideo.classList.add("is-hidden");
    els.outputLink.classList.add("is-hidden");
    els.logTail.textContent = "";
    return;
  }

  const result = job.result || {};
  const probe = result.probe || {};
  const videoStream = (probe.streams || []).find((stream) => stream.codec_type === "video") || {};
  const duration = probe.format?.duration ? `${Number(probe.format.duration).toFixed(2)}s` : result.totalDuration ? `${result.totalDuration}s` : "-";
  const resolution = videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : "-";
  const size = probe.format?.size ? fileSizeLabel(Number(probe.format.size)) : "-";

  els.jobStatus.textContent = `${statusLabel(job)} - ${job.title}`;
  els.verificationGrid.innerHTML = [
    metric("Status", statusLabel(job)),
    metric("Unique uploads", String(job.uploads.length)),
    metric("Duplicates skipped", String(job.duplicateCount || 0)),
    metric("Clips selected", result.clipCount ? String(result.clipCount) : "-"),
    metric("Duration", duration),
    metric("Resolution", resolution),
    metric("Output size", size),
    metric("Style", result.planStyle || job.style)
  ].join("");
  els.logTail.textContent = (job.logTail || []).join("\n");

  if (job.status === "complete" && result.outputUrl) {
    els.outputVideo.src = result.outputUrl;
    els.outputLink.href = result.outputUrl;
    els.outputVideo.classList.remove("is-hidden");
    els.outputLink.classList.remove("is-hidden");
  } else {
    els.outputVideo.classList.add("is-hidden");
    els.outputLink.classList.add("is-hidden");
  }
}

function renderHistory() {
  const filtered = state.filter === "all" ? state.jobs : state.jobs.filter((job) => job.sideQuest === state.filter);

  if (!filtered.length) {
    els.historyList.innerHTML = `<div class="history-item"><strong>No quests yet</strong><span>Upload a batch to start.</span></div>`;
    return;
  }

  els.historyList.innerHTML = filtered
    .map((job) => {
      const classes = ["history-item", job.status === "complete" ? "is-complete" : "", job.status === "failed" ? "is-failed" : ""].filter(Boolean).join(" ");
      const date = job.createdAt ? new Date(job.createdAt).toLocaleString() : "";
      return `
        <button class="${classes}" type="button" data-job-id="${job.id}">
          <strong>${job.title}</strong>
          <span>${job.sideQuest} - ${job.persona}</span>
          <span>${statusLabel(job)} - ${date}</span>
        </button>`;
    })
    .join("");
}

async function loadJobs() {
  const data = await api("/api/quests");
  state.jobs = data.jobs || [];
  if (!state.activeJobId && state.jobs.length) state.activeJobId = state.jobs[0].id;
  renderHistory();

  if (state.activeJobId) {
    const active = state.jobs.find((job) => job.id === state.activeJobId);
    renderVerification(active);
  }
}

async function pollJob(jobId) {
  window.clearTimeout(state.pollTimer);
  state.activeJobId = jobId;

  try {
    const data = await api(`/api/quests/${jobId}`);
    const job = data.job;
    renderVerification(job);
    await loadJobs();

    if (job.status === "queued" || job.status === "processing") {
      state.pollTimer = window.setTimeout(() => pollJob(jobId), 2200);
    } else {
      els.submitButton.disabled = false;
      els.submitButton.textContent = "Render Quest";
    }
  } catch (error) {
    els.jobStatus.textContent = error.message;
    els.submitButton.disabled = false;
    els.submitButton.textContent = "Render Quest";
  }
}

async function checkSession() {
  const data = await api("/api/me");
  state.user = data.user;
  els.loginGate.classList.toggle("is-hidden", Boolean(data.authenticated));
  els.logoutButton.classList.toggle("is-hidden", !data.authRequired);
  els.sessionState.textContent = data.authenticated ? `${data.user.name} - ${data.user.authMode}` : "Locked";

  if (data.authenticated) await loadJobs();
}

els.questForm.addEventListener("input", (event) => {
  if (event.target.name !== "prompt") syncPrompt();
  if (event.target === els.videoInput) updateUploadMeta();
});

els.questForm.addEventListener("change", (event) => {
  if (event.target.name !== "prompt") syncPrompt();
  if (event.target === els.videoInput) updateUploadMeta();
});

els.questForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = Array.from(els.videoInput.files || []);

  if (!files.length) {
    els.uploadMeta.textContent = "Select at least one video";
    return;
  }

  const formData = new FormData(els.questForm);

  els.submitButton.disabled = true;
  els.submitButton.textContent = "Queued";
  els.jobStatus.textContent = "Uploading";

  try {
    const data = await fetch(apiPath("/api/quests"), {
      method: "POST",
      credentials: "same-origin",
      body: formData
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.error || "Upload failed");
      return body;
    });

    state.activeJobId = data.job.id;
    renderVerification(data.job);
    await loadJobs();
    pollJob(data.job.id);
  } catch (error) {
    els.jobStatus.textContent = error.message;
    els.submitButton.disabled = false;
    els.submitButton.textContent = "Render Quest";
  }
});

els.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-job-id]");
  if (!button) return;
  const job = state.jobs.find((item) => item.id === button.dataset.jobId);
  state.activeJobId = button.dataset.jobId;
  renderVerification(job);
  if (job && (job.status === "queued" || job.status === "processing")) pollJob(job.id);
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    state.filter = button.dataset.filter;
    renderHistory();
  });
});

els.refreshHistory.addEventListener("click", () => {
  loadJobs().catch((error) => {
    els.jobStatus.textContent = error.message;
  });
});

els.logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
  state.jobs = [];
  renderHistory();
  renderVerification(null);
  await checkSession();
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  const password = new FormData(els.loginForm).get("password");

  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    await checkSession();
  } catch (error) {
    els.loginError.textContent = "Bad password";
  }
});

syncPrompt();
updateUploadMeta();
renderVerification(null);
checkSession().catch((error) => {
  els.sessionState.textContent = error.message;
});
