const fs = require("node:fs/promises");
const path = require("node:path");

let logFile = null;

function init(dataRoot) {
  logFile = path.join(dataRoot, "analytics", "verifications.jsonl");
}

async function recordVerification(job, verification) {
  if (!logFile || !verification) return;
  const entry = {
    jobId: job.id,
    title: job.title,
    persona: job.persona,
    sideQuest: job.sideQuest,
    questSlug: job.questSlug || null,
    decision: verification.decision,
    fulfilled: verification.fulfilled,
    confidence: verification.confidence,
    provider: verification.provider,
    model: verification.model,
    verifiedAt: verification.verifiedAt
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

function countByDecision(entries) {
  const buckets = { pass: 0, flag: 0, reject: 0 };
  for (const entry of entries) {
    if (buckets[entry.decision] != null) buckets[entry.decision] += 1;
  }
  return buckets;
}

function groupDecisions(entries, key) {
  const buckets = {};
  for (const entry of entries) {
    const bucket = entry[key] || "unknown";
    const b = (buckets[bucket] = buckets[bucket] || { count: 0, pass: 0 });
    b.count += 1;
    if (entry.decision === "pass") b.pass += 1;
  }
  return Object.fromEntries(
    Object.entries(buckets)
      .map(([name, b]) => [name, { count: b.count, passRate: b.count ? Math.round((b.pass / b.count) * 100) / 100 : 0 }])
      .sort((a, b) => (b[1].passRate || 0) - (a[1].passRate || 0))
  );
}

async function summary() {
  const entries = await readEntries();
  if (!entries.length) {
    return { totalVerified: 0, passRate: null, avgConfidence: null, decisions: { pass: 0, flag: 0, reject: 0 }, byProvider: {}, byPersona: {}, bySideQuest: {}, recent: [] };
  }

  const decisions = countByDecision(entries);
  const passRate = Math.round((decisions.pass / entries.length) * 100) / 100;

  return {
    totalVerified: entries.length,
    passRate,
    avgConfidence: avg(entries.map((entry) => entry.confidence).filter((value) => Number.isFinite(value))),
    decisions,
    byProvider: groupDecisions(entries, "provider"),
    byPersona: groupDecisions(entries, "persona"),
    bySideQuest: groupDecisions(entries, "sideQuest"),
    recent: entries.slice(-10).reverse().map((entry) => ({
      jobId: entry.jobId,
      title: entry.title,
      decision: entry.decision,
      confidence: entry.confidence,
      provider: entry.provider,
      verifiedAt: entry.verifiedAt
    }))
  };
}

module.exports = { init, recordVerification, summary };
