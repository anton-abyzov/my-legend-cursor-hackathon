const fs = require("node:fs/promises");
const path = require("node:path");

const STAGES = [
  { key: "upload", label: "Ingesting proof", weight: 20, expected: 3 },
  { key: "verify", label: "Verifying proof", weight: 80, expected: 14 }
];

const STAGE_BY_KEY = new Map(STAGES.map((stage) => [stage.key, stage]));
// Kept as the default "long stage" estimate for ETA smoothing. The verify stage
// is now the dominant one; the name is retained to avoid churn in the helpers.
const DEFAULT_RENDER_SECONDS = STAGE_BY_KEY.get("verify").expected;
const MAX_HISTORY = 12;

function createProgress(expectedRenderSeconds = DEFAULT_RENDER_SECONDS) {
  return {
    status: "processing",
    currentStage: null,
    expectedRenderSeconds: Number(expectedRenderSeconds) || DEFAULT_RENDER_SECONDS,
    stages: STAGES.map((stage) => ({ key: stage.key, label: stage.label, status: "pending", startedAt: null, endedAt: null, detail: null, percent: 0 }))
  };
}

function applyStage(progress, key, patch = {}, now = Date.now()) {
  if (!progress || !progress.stages) return;
  const stage = progress.stages.find((item) => item.key === key);
  if (!stage) return;

  if (patch.status && patch.status !== stage.status) {
    if (patch.status === "active") {
      stage.startedAt = now;
      stage.percent = 0;
      progress.currentStage = key;
      for (const prior of progress.stages) {
        if (prior.key === key) break;
        if (prior.status === "pending") prior.status = "skipped";
        if (prior.status === "active") {
          prior.status = "done";
          prior.endedAt = prior.endedAt || now;
          prior.percent = 1;
        }
      }
    }
    if (patch.status === "done" || patch.status === "failed" || patch.status === "skipped") {
      stage.endedAt = now;
      if (patch.status === "done") stage.percent = 1;
    }
    stage.status = patch.status;
  }

  if (typeof patch.percent === "number" && stage.status === "active") {
    stage.percent = Math.max(0, Math.min(1, patch.percent));
  }
  if (patch.detail != null) stage.detail = String(patch.detail);
}

function finishProgress(progress, status, now = Date.now()) {
  if (!progress) return;
  progress.status = status;
  if (status === "complete") {
    for (const stage of progress.stages) {
      if (stage.status === "pending" || stage.status === "active") {
        stage.status = "done";
        stage.endedAt = stage.endedAt || now;
        stage.percent = 1;
      }
    }
    progress.currentStage = null;
  } else if (status === "failed") {
    const active = progress.stages.find((stage) => stage.status === "active");
    if (active) {
      active.status = "failed";
      active.endedAt = active.endedAt || now;
    }
  }
}

function expectedFor(progress, stage) {
  if (stage.key === "render") return progress.expectedRenderSeconds || DEFAULT_RENDER_SECONDS;
  return STAGE_BY_KEY.get(stage.key)?.expected || 3;
}

function activeFraction(progress, stage, now) {
  if (stage.percent > 0) return Math.min(0.95, stage.percent);
  if (!stage.startedAt) return 0;
  const elapsed = (now - stage.startedAt) / 1000;
  return Math.min(0.95, elapsed / Math.max(1, expectedFor(progress, stage)));
}

function summarize(progress, now = Date.now()) {
  if (!progress || !progress.stages) return null;

  let percent = 0;
  let etaSeconds = 0;

  for (const stage of progress.stages) {
    const def = STAGE_BY_KEY.get(stage.key);
    if (!def) continue;
    if (stage.status === "done" || stage.status === "skipped") {
      percent += def.weight;
    } else if (stage.status === "active") {
      const fraction = activeFraction(progress, stage, now);
      percent += def.weight * fraction;
      etaSeconds += expectedFor(progress, stage) * (1 - fraction);
    } else if (stage.status === "pending") {
      etaSeconds += expectedFor(progress, stage);
    }
  }

  if (progress.status === "complete") {
    percent = 100;
    etaSeconds = 0;
  } else if (progress.status === "failed") {
    etaSeconds = 0;
    percent = Math.min(percent, 99);
  } else {
    percent = Math.min(percent, 99);
  }

  return {
    status: progress.status,
    currentStage: progress.currentStage,
    percent: Math.round(percent),
    etaSeconds: Math.max(0, Math.round(etaSeconds)),
    stages: progress.stages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      status: stage.status,
      detail: stage.detail || null
    }))
  };
}

function renderDurationSeconds(progress) {
  const stage = progress?.stages?.find((item) => item.key === "render");
  if (!stage || !stage.startedAt || !stage.endedAt) return null;
  const seconds = (stage.endedAt - stage.startedAt) / 1000;
  return seconds > 1 && seconds < 3600 ? seconds : null;
}

function statsPath(dataRoot) {
  return path.join(dataRoot, "render-stats.json");
}

async function loadRenderStats(dataRoot) {
  try {
    const raw = await fs.readFile(statsPath(dataRoot), "utf8");
    const parsed = JSON.parse(raw);
    const durations = Array.isArray(parsed.durations) ? parsed.durations : [];
    const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : DEFAULT_RENDER_SECONDS;
    return { durations, avgRenderSeconds: Math.round(avg) };
  } catch {
    return { durations: [], avgRenderSeconds: DEFAULT_RENDER_SECONDS };
  }
}

async function recordRenderDuration(dataRoot, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const { durations } = await loadRenderStats(dataRoot);
  durations.push(Math.round(seconds));
  const trimmed = durations.slice(-MAX_HISTORY);
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(statsPath(dataRoot), JSON.stringify({ durations: trimmed, updatedAt: new Date().toISOString() }, null, 2));
}

function parseRenderFraction(text) {
  const percentMatch = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(text);
  if (percentMatch) {
    const value = Number(percentMatch[1]) / 100;
    if (value >= 0 && value <= 1) return value;
  }
  const frameMatch = /(?:frames?\s+)?(\d+)\s*\/\s*(\d+)/i.exec(text);
  if (frameMatch) {
    const current = Number(frameMatch[1]);
    const total = Number(frameMatch[2]);
    if (total > 0 && current >= 0 && current <= total) return current / total;
  }
  return null;
}

module.exports = {
  STAGES,
  createProgress,
  applyStage,
  finishProgress,
  summarize,
  renderDurationSeconds,
  loadRenderStats,
  recordRenderDuration,
  parseRenderFraction
};
