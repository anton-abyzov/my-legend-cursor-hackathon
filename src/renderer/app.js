const state = {
  videos: [],
  project: null,
  render: null,
  busy: false,
  selectedQuest: null,
  questFilters: { difficulty: "all", cost: "all", category: "all", search: "" },
  questMode: "recommended",
  progress: null,
  searchTimer: null
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
  gradeCard: document.getElementById("gradeCard"),
  logOutput: document.getElementById("logOutput"),
  clearLog: document.getElementById("clearLog"),
  questSlot: document.getElementById("questSlot"),
  questSlotTitle: document.getElementById("questSlotTitle"),
  questSlotDesc: document.getElementById("questSlotDesc"),
  questSlotBadges: document.getElementById("questSlotBadges"),
  questPicker: document.getElementById("questPicker"),
  questPickerClose: document.getElementById("questPickerClose"),
  questPickerMeta: document.getElementById("questPickerMeta"),
  questSearch: document.getElementById("questSearch"),
  difficultyChips: document.getElementById("difficultyChips"),
  costChips: document.getElementById("costChips"),
  categorySelect: document.getElementById("categorySelect"),
  rollRandom: document.getElementById("rollRandom"),
  questResults: document.getElementById("questResults"),
  questModes: document.getElementById("questModes")
};

const DIFF_RANK = { easy: 1, medium: 2, hard: 3, extreme: 4 };
const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", extreme: "Extreme" };

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

const BREAKDOWN_LABELS = {
  promptMatch: "Prompt match",
  visualQuality: "Visual quality",
  pacing: "Pacing",
  audienceFit: "Audience fit"
};

function gradeTone(score) {
  if (score >= 8.5) return "is-ships";
  if (score >= 7) return "is-strong";
  if (score >= 5) return "is-passable";
  return "is-weak";
}

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
  els.gradeCard.classList.remove("is-hidden");
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

function renderPreview(render) {
  if (!render) {
    els.previewSlot.innerHTML = '<div class="preview-empty">Render output appears here</div>';
    renderGrade(null);
    return;
  }

  els.previewSlot.innerHTML = `
    <video controls src="${render.outputUrl}"></video>
  `;
  renderGrade(render.grade || null);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function payload() {
  const quest = state.selectedQuest;
  return {
    videoPaths: state.videos.map((video) => video.path),
    prompt: els.prompt.value,
    audience: els.audience.value,
    aspect: els.aspect.value,
    targetDuration: Number(els.targetDuration.value) || 30,
    sideQuest: quest ? quest.title : null,
    questSlug: quest ? quest.slug : null,
    questCategory: quest ? quest.category : null,
    questDifficulty: quest ? quest.difficulty : null,
    questXp: quest ? quest.total_xp : null
  };
}

/* ── quest picker + smart selection ──────────────────────────── */
function questBadges(quest) {
  const badges = [
    `<span class="badge dif-${quest.difficulty}">${DIFF_LABEL[quest.difficulty] || quest.difficulty}</span>`,
    `<span class="badge xp">${quest.total_xp} XP</span>`,
    `<span class="badge">${escapeHtml(quest.category)}</span>`
  ];
  if (quest.cost && quest.cost !== "free") badges.push(`<span class="badge">${escapeHtml(quest.cost)}</span>`);
  return badges.join("");
}

function renderQuestSlot() {
  const quest = state.selectedQuest;
  const cta = els.questSlot.querySelector(".quest-slot-cta");
  if (!quest) {
    els.questSlot.classList.add("is-empty");
    els.questSlot.classList.remove("is-set");
    els.questSlotTitle.textContent = "No quest selected";
    els.questSlotDesc.textContent = "Pick a side quest to start.";
    els.questSlotBadges.innerHTML = "";
    cta.textContent = "Choose";
    return;
  }
  els.questSlot.classList.remove("is-empty");
  els.questSlot.classList.add("is-set");
  els.questSlotTitle.textContent = quest.title;
  els.questSlotDesc.textContent = quest.description;
  els.questSlotBadges.innerHTML = questBadges(quest);
  cta.textContent = "Change";
}

function questPromptLine(quest) {
  return `Side quest: "${quest.title}" (${quest.category}, ${quest.difficulty}, ${quest.total_xp} XP) — ${quest.description}`;
}

function selectQuest(quest) {
  state.selectedQuest = quest;
  renderQuestSlot();
  const line = questPromptLine(quest);
  const base = "Create a no-silence Gen Z side quest reel from these clips. Cut to the strongest audible moments, add kinetic captions, keep the pacing fast, and prove the quest was completed.";
  els.prompt.value = `${base}\n${line}`;
  els.audience.value = `Gen Z · ${quest.category} side quest`;
  closePicker();
}

function renderProgressHeader() {
  const p = state.progress;
  els.questPickerMeta.textContent = p
    ? `Level ${p.level} · ${(p.earnedXp || 0).toLocaleString()} XP · ${(p.completedSlugs || []).length} completed`
    : "Catalog";
}

async function loadProgress() {
  try {
    state.progress = await window.legend.quests.progress();
  } catch {
    state.progress = { earnedXp: 0, level: 1, completedSlugs: [], bestGradeBySlug: {} };
  }
  renderProgressHeader();
}

function unlockedRank() {
  return Math.min(4, state.progress?.level || 1);
}

function renderQuestResults(quests) {
  if (!quests.length) {
    els.questResults.innerHTML = `<div class="quest-empty">No quests match these filters.</div>`;
    return;
  }
  const completed = new Set(state.progress?.completedSlugs || []);
  const bestGrades = state.progress?.bestGradeBySlug || {};
  const unlocked = unlockedRank();
  state.questCache = quests;

  els.questResults.innerHTML = quests
    .map((quest) => {
      const isDone = completed.has(quest.slug);
      const best = bestGrades[quest.slug];
      const locked = (DIFF_RANK[quest.difficulty] || 2) > unlocked;
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
}

function currentFilters() {
  const f = state.questFilters;
  const out = {};
  if (f.difficulty !== "all") out.difficulty = f.difficulty;
  if (f.cost !== "all") out.cost = f.cost;
  if (f.category !== "all") out.category = f.category;
  if (f.search) out.search = f.search;
  return out;
}

async function loadQuests() {
  els.questResults.innerHTML = `<div class="quest-empty">Loading quests...</div>`;
  try {
    const filters = currentFilters();
    let data;
    if (state.questMode === "browse") data = await window.legend.quests.browse(filters);
    else if (state.questMode === "daily") data = await window.legend.quests.daily(filters);
    else data = await window.legend.quests.recommend(filters);

    if (els.categorySelect.options.length <= 1) {
      const facets = await window.legend.quests.facets();
      const cats = (facets.categories || []).map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.count})</option>`).join("");
      els.categorySelect.innerHTML = `<option value="all">All categories</option>${cats}`;
    }
    renderQuestResults(data.quests || (data.quest ? [data.quest] : []));
  } catch (error) {
    els.questResults.innerHTML = `<div class="quest-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function openPicker() {
  els.questPicker.classList.remove("is-hidden");
  await loadProgress();
  await loadQuests();
}

function closePicker() {
  els.questPicker.classList.add("is-hidden");
}

function setupPicker() {
  els.questSlot.addEventListener("click", openPicker);
  els.questPickerClose.addEventListener("click", closePicker);
  els.questPicker.addEventListener("click", (event) => {
    if (event.target === els.questPicker) closePicker();
  });
  els.questResults.addEventListener("click", (event) => {
    const card = event.target.closest("[data-slug]");
    if (!card) return;
    const quest = (state.questCache || []).find((q) => q.slug === card.dataset.slug);
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
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.questFilters.search = els.questSearch.value.trim();
      loadQuests();
    }, 220);
  });
  els.rollRandom.addEventListener("click", async () => {
    try {
      const data = await window.legend.quests.random(currentFilters());
      if (data.quest) selectQuest(data.quest);
    } catch (error) {
      els.questResults.innerHTML = `<div class="quest-empty">${escapeHtml(error.message)}</div>`;
    }
  });
  els.questModes.addEventListener("click", (event) => {
    const seg = event.target.closest(".seg");
    if (!seg) return;
    state.questMode = seg.dataset.mode;
    els.questModes.querySelectorAll(".seg").forEach((s) => s.classList.toggle("is-active", s === seg));
    loadQuests();
  });
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
      ...payload(),
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
setupPicker();
renderQuestSlot();
renderVideos();
renderCutPlan(null);
renderPreview(null);
openPicker();
