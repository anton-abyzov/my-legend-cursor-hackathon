const config = window.LEGEND_CONFIG || { basePath: "" };
const basePath = config.basePath || "";

const state = {
  user: null,
  jobs: [],
  filter: "all",
  activeJobId: null,
  pollTimer: null,
  selectedQuest: null,
  questFilters: { difficulty: "all", cost: "all", category: "all", search: "" },
  questSource: null,
  searchTimer: null,
  bar: { display: 0, target: 0, raf: null }
};

const STEP_ICON = { done: "✓", active: "", failed: "✕", skipped: "–", pending: "" };

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
  gradeCard: document.querySelector("#gradeCard"),
  verificationGrid: document.querySelector("#verificationGrid"),
  outputVideo: document.querySelector("#outputVideo"),
  outputLink: document.querySelector("#outputLink"),
  progressPanel: document.querySelector("#progressPanel"),
  progressStage: document.querySelector("#progressStage"),
  progressEta: document.querySelector("#progressEta"),
  progressFill: document.querySelector("#progressFill"),
  progressSteps: document.querySelector("#progressSteps"),
  logDetails: document.querySelector("#logDetails"),
  logTail: document.querySelector("#logTail"),
  loginGate: document.querySelector("#loginGate"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError"),
  loginSubtitle: document.querySelector("#loginSubtitle"),
  emailField: document.querySelector("#emailField"),
  signInButton: document.querySelector("#signInButton"),
  signUpButton: document.querySelector("#signUpButton"),
  googleWrap: document.querySelector("#googleWrap"),
  googleButton: document.querySelector("#googleButton"),
  questSlot: document.querySelector("#questSlot"),
  questSlotTitle: document.querySelector("#questSlotTitle"),
  questSlotDesc: document.querySelector("#questSlotDesc"),
  questSlotBadges: document.querySelector("#questSlotBadges"),
  sideQuestInput: document.querySelector("#sideQuestInput"),
  questSlugInput: document.querySelector("#questSlugInput"),
  questCategoryInput: document.querySelector("#questCategoryInput"),
  questDifficultyInput: document.querySelector("#questDifficultyInput"),
  questXpInput: document.querySelector("#questXpInput"),
  questPicker: document.querySelector("#questPicker"),
  questPickerClose: document.querySelector("#questPickerClose"),
  questPickerMeta: document.querySelector("#questPickerMeta"),
  questSearch: document.querySelector("#questSearch"),
  difficultyChips: document.querySelector("#difficultyChips"),
  costChips: document.querySelector("#costChips"),
  categorySelect: document.querySelector("#categorySelect"),
  rollRandom: document.querySelector("#rollRandom"),
  questResults: document.querySelector("#questResults")
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
  const quest = state.selectedQuest;
  const sideQuest = quest ? quest.title : formValue("sideQuest") || "Hackathon proof";
  const style = formValue("style") || "fast viral proof";
  const aspectLabel = els.questForm.elements.aspect.selectedOptions[0]?.textContent || "Vertical 9:16";
  const targetDuration = formValue("targetDuration") || "18";

  const questLine = quest
    ? `Side quest: "${quest.title}" (${quest.category}, ${quest.difficulty}, worth ${quest.total_xp} XP) — ${quest.description}`
    : `Side quest: ${sideQuest}.`;

  return [
    `Build a ${targetDuration}s ${aspectLabel} HyperFrames edit called "${title}".`,
    `Audience: ${persona}. Style: ${style}.`,
    questLine,
    "Prove the quester actually completed the challenge. Select the strongest audible moments, remove silence, and avoid duplicate source clips.",
    "Use kinetic labels, a visible progress rail, and short captions that explain why each beat matters.",
    `End on a payoff frame that stamps the ${quest ? quest.total_xp + " XP" : "XP"} win, not a description.`
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
  els.uploadMeta.textContent = files.length ? `${files.length} file${files.length === 1 ? "" : "s"} / ${fileSizeLabel(total)}` : "Select at least one video";
  // Block submission until a video exists; only toggle when idle (not mid-render).
  if (els.submitButton.textContent === "Render Quest") {
    els.submitButton.disabled = files.length === 0;
  }
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

function etaLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `~${Math.round(seconds)}s left`;
  const mins = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `~${mins}m${rest ? ` ${rest}s` : ""} left`;
}

function animateBar() {
  const step = () => {
    const diff = state.bar.target - state.bar.display;
    if (Math.abs(diff) < 0.15) {
      state.bar.display = state.bar.target;
      state.bar.raf = null;
      els.progressFill.style.width = `${state.bar.display}%`;
      return;
    }
    state.bar.display += diff * 0.08;
    els.progressFill.style.width = `${state.bar.display}%`;
    state.bar.raf = window.requestAnimationFrame(step);
  };
  if (!state.bar.raf) state.bar.raf = window.requestAnimationFrame(step);
}

function setBar(target, { immediate = false } = {}) {
  state.bar.target = Math.max(0, Math.min(100, target));
  if (immediate) {
    if (state.bar.raf) window.cancelAnimationFrame(state.bar.raf);
    state.bar.raf = null;
    state.bar.display = state.bar.target;
    els.progressFill.style.width = `${state.bar.display}%`;
    return;
  }
  animateBar();
}

function renderProgress(job) {
  const progress = job && job.progress;
  const active = job && (job.status === "queued" || job.status === "processing");

  if (!progress) {
    els.progressPanel.classList.add("is-hidden");
    if (state.bar.raf) window.cancelAnimationFrame(state.bar.raf);
    state.bar.raf = null;
    state.bar.display = 0;
    state.bar.target = 0;
    return;
  }

  els.progressPanel.classList.remove("is-hidden");
  els.progressPanel.classList.toggle("is-failed", progress.status === "failed");

  const current = progress.stages.find((stage) => stage.key === progress.currentStage);
  const headline = progress.status === "complete" ? "Complete" : progress.status === "failed" ? "Render failed" : current ? current.label : "Starting";
  els.progressStage.textContent = headline;
  els.progressEta.textContent = active ? etaLabel(progress.etaSeconds) : progress.status === "complete" ? "Done" : "";

  els.progressSteps.innerHTML = progress.stages
    .map((stage) => {
      const icon = stage.status === "active" ? `<span class="step-spinner"></span>` : `<span class="step-icon">${STEP_ICON[stage.status] || ""}</span>`;
      const detail = stage.detail ? `<em>${escapeHtml(stage.detail)}</em>` : "";
      return `<li class="progress-step is-${stage.status}">${icon}<span class="step-label">${escapeHtml(stage.label)}</span>${detail}</li>`;
    })
    .join("");

  setBar(progress.percent, { immediate: progress.status === "complete" });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function gradeTone(score) {
  if (score >= 8.5) return "is-ships";
  if (score >= 7) return "is-strong";
  if (score >= 5) return "is-passable";
  return "is-weak";
}

const BREAKDOWN_LABELS = {
  promptMatch: "Prompt match",
  visualQuality: "Visual quality",
  pacing: "Pacing",
  audienceFit: "Audience fit"
};

function renderGrade(grade) {
  if (!grade) {
    els.gradeCard.classList.add("is-hidden");
    els.gradeCard.innerHTML = "";
    return;
  }

  const score = Number(grade.score || 0);
  const verdict = String(grade.verdict || "Judged").toUpperCase();
  const tier = [grade.provider, grade.model].filter(Boolean).join(" · ") || "heuristic · deterministic";
  const bars = Object.entries(grade.breakdown || {})
    .map(([key, value]) => {
      const pct = Math.max(0, Math.min(100, Number(value) * 10));
      return `
        <div class="grade-bar">
          <span>${BREAKDOWN_LABELS[key] || key}</span>
          <div class="grade-track"><div class="grade-fill" style="width:${pct}%"></div></div>
          <em>${Number(value).toFixed(1)}</em>
        </div>`;
    })
    .join("");

  const gaps = (grade.gaps || []).length
    ? `<div class="grade-flip-gaps">${grade.gaps.map((g) => `<div class="grade-gap">${escapeHtml(g)}</div>`).join("")}</div>`
    : "";

  els.gradeCard.className = `grade-card grade-flip ${gradeTone(score)}`;
  els.gradeCard.innerHTML = `
    <div class="grade-flip-head">AI verification</div>
    <button type="button" class="grade-flip-card" aria-label="Toggle AI verification details">
      <div class="grade-flip-inner">
        <div class="grade-flip-side grade-flip-front">
          <div class="grade-flip-score"><strong>${score.toFixed(1)}</strong><span>/10</span></div>
          <div class="grade-flip-verdict">${escapeHtml(verdict)}</div>
          <div class="grade-flip-tier">${escapeHtml(tier)}</div>
          <div class="grade-flip-hint">tap for breakdown</div>
        </div>
        <div class="grade-flip-side grade-flip-back">
          <div class="grade-bars">${bars}</div>
          ${grade.rationale ? `<p class="grade-flip-note">${escapeHtml(grade.rationale)}</p>` : ""}
          ${gaps}
          <div class="grade-flip-hint">tap for score</div>
        </div>
      </div>
    </button>`;

  const toggle = els.gradeCard.querySelector(".grade-flip-card");
  const inner = els.gradeCard.querySelector(".grade-flip-inner");
  if (toggle && inner) {
    toggle.addEventListener("click", () => {
      const flipped = inner.classList.toggle("is-flipped");
      toggle.setAttribute("aria-pressed", flipped ? "true" : "false");
    });
  }
}

function renderVerification(job) {
  if (!job) {
    els.verificationGrid.innerHTML = "";
    renderGrade(null);
    renderProgress(null);
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

  const headline = job.progress && job.progress.currentStage && job.status === "processing"
    ? (job.progress.stages.find((stage) => stage.key === job.progress.currentStage)?.label || statusLabel(job))
    : statusLabel(job);
  els.jobStatus.textContent = `${headline} - ${job.title}`;
  renderProgress(job);
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
  renderGrade(job.grade);

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
  const filtered = state.filter === "all" ? state.jobs : state.jobs.filter((job) => job.questDifficulty === state.filter);

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

  if (data.authenticated) {
    await loadJobs();
    if (!state.selectedQuest) openPicker();
  }
}

/* ── quest picker + smart selection ──────────────────────────── */
const DIFF_RANK = { easy: 1, medium: 2, hard: 3, extreme: 4 };
const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", extreme: "Extreme" };

function playerLevel() {
  return state.progress?.level || 1;
}

function unlockedRank() {
  return Math.min(4, playerLevel());
}

function questBadges(quest, { compact = false } = {}) {
  const badges = [
    `<span class="badge dif-${quest.difficulty}">${DIFF_LABEL[quest.difficulty] || quest.difficulty}</span>`,
    `<span class="badge xp">${quest.total_xp} XP</span>`
  ];
  if (!compact) {
    badges.push(`<span class="badge">${escapeHtml(quest.category)}</span>`);
    if (quest.cost && quest.cost !== "free") badges.push(`<span class="badge">${escapeHtml(quest.cost)}</span>`);
    if (quest.social && quest.social !== "either") badges.push(`<span class="badge">${escapeHtml(quest.social)}</span>`);
  }
  return badges.join("");
}

function renderQuestSlot() {
  const quest = state.selectedQuest;
  if (!quest) {
    els.questSlot.classList.add("is-empty");
    els.questSlot.classList.remove("is-set");
    els.questSlotTitle.textContent = "No quest selected";
    els.questSlotDesc.textContent = "Pick a side quest to start the legend.";
    els.questSlotBadges.innerHTML = "";
    els.questSlot.querySelector(".quest-slot-cta").textContent = "Choose";
    return;
  }
  els.questSlot.classList.remove("is-empty");
  els.questSlot.classList.add("is-set");
  els.questSlotTitle.textContent = quest.title;
  els.questSlotDesc.textContent = quest.description;
  els.questSlotBadges.innerHTML = questBadges(quest);
  els.questSlot.querySelector(".quest-slot-cta").textContent = "Change";
}

function selectQuest(quest) {
  state.selectedQuest = quest;
  els.sideQuestInput.value = quest.title;
  els.questSlugInput.value = quest.slug;
  els.questCategoryInput.value = quest.category;
  els.questDifficultyInput.value = quest.difficulty;
  els.questXpInput.value = String(quest.total_xp);
  renderQuestSlot();
  syncPrompt();
  closePicker();
}

function renderProgressHeader() {
  const p = state.progress;
  if (!p) {
    els.questPickerMeta.textContent = `${state.questSource === "supabase" ? "Supabase" : "Local"} catalog`;
    return;
  }
  els.questPickerMeta.textContent = `Level ${p.level} · ${p.earnedXp.toLocaleString()} XP · ${p.completedSlugs.length} completed`;
}

async function loadProgress() {
  try {
    const data = await api("/api/progress");
    data.completedSlugs = data.completedSlugs || [];
    data.bestGradeBySlug = data.bestGradeBySlug || {};
    state.progress = data;
  } catch {
    state.progress = { earnedXp: 0, level: 1, completedSlugs: [], bestGradeBySlug: {} };
  }
  renderProgressHeader();
}

function questQueryString() {
  const f = state.questFilters;
  const params = new URLSearchParams();
  if (f.difficulty && f.difficulty !== "all") params.set("difficulty", f.difficulty);
  if (f.cost && f.cost !== "all") params.set("cost", f.cost);
  if (f.category && f.category !== "all") params.set("category", f.category);
  if (f.search) params.set("search", f.search);
  return params.toString();
}

function questEndpoint() {
  if (state.questMode === "browse") return "/api/side-quests";
  if (state.questMode === "daily") return "/api/side-quests/daily";
  return "/api/side-quests/recommended";
}

function renderQuestResults(quests) {
  if (!quests.length) {
    els.questResults.innerHTML = `<div class="quest-empty">No quests match these filters. Loosen them or roll random.</div>`;
    return;
  }
  const completed = new Set(state.progress?.completedSlugs || []);
  const bestGrades = state.progress?.bestGradeBySlug || {};
  const unlocked = unlockedRank();

  els.questResults.innerHTML = quests
    .map((quest) => {
      const isDone = completed.has(quest.slug);
      const best = bestGrades[quest.slug];
      const locked = DIFF_RANK[quest.difficulty] > unlocked;
      const flags = [];
      if (isDone) flags.push(`<span class="badge done">Done</span>`);
      if (best != null) flags.push(`<span class="badge grade">${Number(best).toFixed(1)}/10</span>`);
      if (locked) flags.push(`<span class="badge lock">Lvl ${DIFF_RANK[quest.difficulty]}</span>`);
      return `
        <button type="button" class="quest-card${isDone ? " is-done" : ""}" data-slug="${escapeHtml(quest.slug)}">
          <h3>${escapeHtml(quest.title)}</h3>
          <p>${escapeHtml(quest.description)}</p>
          <div class="quest-card-badges">${questBadges(quest)}${flags.join("")}</div>
        </button>`;
    })
    .join("");

  els.questResults.dataset.cache = JSON.stringify(quests);
}

async function loadQuests() {
  els.questResults.innerHTML = `<div class="quest-empty">Loading quests...</div>`;
  const qs = questQueryString();
  const sep = questEndpoint().includes("?") ? "&" : "?";
  try {
    const data = await api(`${questEndpoint()}${qs ? sep + qs : ""}`);
    state.questSource = data.source || state.questSource;
    if (data.facets && els.categorySelect.options.length <= 1) populateCategories(data.facets);
    const quests = data.quests || (data.quest ? [data.quest] : []);
    renderQuestResults(quests);
  } catch (error) {
    els.questResults.innerHTML = `<div class="quest-empty">${escapeHtml(error.message)}</div>`;
  }
}

function populateCategories(facets) {
  const cats = (facets.categories || []).map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.count})</option>`).join("");
  els.categorySelect.innerHTML = `<option value="all">All categories</option>${cats}`;
}

function findCachedQuest(slug) {
  try {
    const cache = JSON.parse(els.questResults.dataset.cache || "[]");
    return cache.find((q) => q.slug === slug) || null;
  } catch {
    return null;
  }
}

function openPicker() {
  els.questPicker.classList.remove("is-hidden");
  loadProgress();
  loadQuests();
}

function closePicker() {
  els.questPicker.classList.add("is-hidden");
}

function setMode(mode) {
  state.questMode = mode;
  document.querySelectorAll("#questModes .seg").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  loadQuests();
}

function setupPicker() {
  state.questMode = "recommended";

  els.questSlot.addEventListener("click", openPicker);
  els.questPickerClose.addEventListener("click", closePicker);
  els.questPicker.addEventListener("click", (event) => {
    if (event.target === els.questPicker) closePicker();
  });

  els.questResults.addEventListener("click", (event) => {
    const card = event.target.closest("[data-slug]");
    if (!card) return;
    const quest = findCachedQuest(card.dataset.slug);
    if (quest) selectQuest(quest);
  });

  els.difficultyChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    state.questFilters.difficulty = chip.dataset.value;
    els.difficultyChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    loadQuests();
  });

  els.costChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    state.questFilters.cost = chip.dataset.value;
    els.costChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    loadQuests();
  });

  els.categorySelect.addEventListener("change", () => {
    state.questFilters.category = els.categorySelect.value;
    loadQuests();
  });

  els.questSearch.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.questFilters.search = els.questSearch.value.trim();
      loadQuests();
    }, 220);
  });

  els.rollRandom.addEventListener("click", async () => {
    const qs = questQueryString();
    try {
      const data = await api(`/api/side-quests/random${qs ? `?${qs}` : ""}`);
      if (data.quest) selectQuest(data.quest);
    } catch (error) {
      els.questResults.innerHTML = `<div class="quest-empty">${escapeHtml(error.message)}</div>`;
    }
  });

  const modeBar = document.querySelector("#questModes");
  if (modeBar) {
    modeBar.addEventListener("click", (event) => {
      const seg = event.target.closest(".seg");
      if (seg) setMode(seg.dataset.mode);
    });
  }
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

  if (!state.selectedQuest) {
    openPicker();
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

function isSupabaseAuth() {
  return config.authMode === "supabase";
}

function setupLoginUi() {
  if (isSupabaseAuth()) {
    els.emailField.classList.remove("is-hidden");
    els.signUpButton.classList.remove("is-hidden");
    els.loginSubtitle.textContent = "Sign in or sign up to start your side quests.";
    if (config.googleEnabled) els.googleWrap.classList.remove("is-hidden");
    els.googleButton.addEventListener("click", () => {
      window.location.href = apiPath("/auth/google");
    });
    els.signUpButton.addEventListener("click", () => submitCredentials("signup"));
  } else {
    els.loginSubtitle.textContent = "Enter the access password.";
  }

  const params = new URLSearchParams(window.location.search);
  const authError = params.get("auth_error");
  if (authError) {
    els.loginError.textContent = `Google sign-in failed: ${authError}`;
    window.history.replaceState({}, "", apiPath("/"));
  }
}

async function submitCredentials(intent) {
  els.loginError.textContent = "";
  const form = new FormData(els.loginForm);

  if (!isSupabaseAuth()) {
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: form.get("password") }) });
      await checkSession();
    } catch (error) {
      els.loginError.textContent = "Bad password";
    }
    return;
  }

  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password) {
    els.loginError.textContent = "Email and password are required.";
    return;
  }

  const endpoint = intent === "signup" ? "/api/signup" : "/api/login";
  try {
    const result = await api(endpoint, { method: "POST", body: JSON.stringify({ email, password }) });
    if (intent === "signup" && result.needsConfirmation) {
      els.loginError.textContent = "Account created. Check your email to confirm, then sign in.";
      return;
    }
    await checkSession();
  } catch (error) {
    els.loginError.textContent = intent === "signup" ? `Sign up failed: ${error.message}` : "Invalid email or password.";
  }
}

els.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitCredentials("login");
});

setupLoginUi();
setupPicker();
renderQuestSlot();
syncPrompt();
updateUploadMeta();
renderVerification(null);
checkSession().catch((error) => {
  els.sessionState.textContent = error.message;
});
