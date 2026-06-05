const fs = require("node:fs/promises");
const path = require("node:path");

let logFile = null;

function init(dataRoot) {
  logFile = path.join(dataRoot, "analytics", "grades.jsonl");
}

async function recordGrade(job, grade) {
  if (!logFile || !grade) return;
  const entry = {
    jobId: job.id,
    title: job.title,
    persona: job.persona,
    sideQuest: job.sideQuest,
    style: job.style,
    aspect: job.aspect,
    targetDuration: job.targetDuration,
    score: grade.score,
    verdict: grade.verdict,
    breakdown: grade.breakdown,
    provider: grade.provider,
    model: grade.model,
    gradedAt: grade.gradedAt
  };
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, `${JSON.stringify(entry)}\n`);
}

async function readEntries() {
  if (!logFile) return [];
  try {
    const raw = await fs.readFile(logFile, "utf8");
    return raw
      .split(/\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function avg(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function groupAverage(entries, key) {
  const buckets = {};
  for (const entry of entries) {
    const bucket = entry[key] || "unknown";
    (buckets[bucket] = buckets[bucket] || []).push(entry.score);
  }
  return Object.fromEntries(
    Object.entries(buckets)
      .map(([name, scores]) => [name, { count: scores.length, avgScore: avg(scores) }])
      .sort((a, b) => (b[1].avgScore || 0) - (a[1].avgScore || 0))
  );
}

async function summary() {
  const entries = await readEntries();
  if (!entries.length) {
    return { totalGraded: 0, avgScore: null, breakdown: {}, byProvider: {}, byPersona: {}, bySideQuest: {}, recent: [] };
  }

  const breakdown = {};
  for (const dim of ["promptMatch", "visualQuality", "pacing", "audienceFit"]) {
    breakdown[dim] = avg(entries.map((entry) => entry.breakdown?.[dim]).filter((value) => Number.isFinite(value)));
  }

  const distribution = { ships: 0, strong: 0, passable: 0, weak: 0, "off-brief": 0 };
  for (const entry of entries) {
    if (distribution[entry.verdict] != null) distribution[entry.verdict] += 1;
  }

  return {
    totalGraded: entries.length,
    avgScore: avg(entries.map((entry) => entry.score)),
    breakdown,
    distribution,
    byProvider: groupAverage(entries, "provider"),
    byPersona: groupAverage(entries, "persona"),
    bySideQuest: groupAverage(entries, "sideQuest"),
    recent: entries.slice(-10).reverse().map((entry) => ({
      jobId: entry.jobId,
      title: entry.title,
      score: entry.score,
      verdict: entry.verdict,
      provider: entry.provider,
      gradedAt: entry.gradedAt
    }))
  };
}

module.exports = { init, recordGrade, summary };
