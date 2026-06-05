const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveTool } = require("./ffmpegPaths");
const { runProcess } = require("./process");

const GEMINI_MODEL = process.env.LEGEND_GEMINI_MODEL || "gemini-flash-latest";
const CF_MODEL = process.env.LEGEND_CF_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
const FRAME_COUNT = Math.min(Math.max(Number(process.env.LEGEND_GRADER_FRAMES) || 6, 3), 10);
const FRAME_WIDTH = 512;

const BREAKDOWN_KEYS = ["promptMatch", "visualQuality", "pacing", "audienceFit"];

function geminiKey() {
  return process.env.LEGEND_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
}

function cloudflareAccount() {
  return (
    process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_R2_ACCOUNT_ID ||
    ""
  );
}

function cloudflareToken() {
  return process.env.CLOUDFLARE_WORKERS_AI_TOKEN || process.env.CLOUDFLARE_AI_TOKEN || "";
}

// Which grader is wired up right now. Surfaced at startup and in /healthz.
function graderTier() {
  if (geminiKey()) return { tier: "gemini", model: GEMINI_MODEL, multimodal: true };
  if (cloudflareAccount() && cloudflareToken()) return { tier: "cloudflare", model: CF_MODEL, multimodal: false };
  return { tier: "heuristic", model: "deterministic", multimodal: false };
}

function clampScore(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(10, Math.round(num * 10) / 10));
}

function verdictForScore(score) {
  if (score >= 8.5) return "ships";
  if (score >= 7) return "strong";
  if (score >= 5) return "passable";
  if (score >= 3) return "weak";
  return "off-brief";
}

function normalizeGrade(raw, { provider, model }) {
  const breakdown = {};
  for (const key of BREAKDOWN_KEYS) {
    breakdown[key] = clampScore(raw?.breakdown?.[key], 0);
  }
  const present = BREAKDOWN_KEYS.filter((key) => raw?.breakdown && raw.breakdown[key] != null);
  const derived = present.length
    ? present.reduce((sum, key) => sum + breakdown[key], 0) / present.length
    : 0;
  const score = clampScore(raw?.score ?? derived, derived);

  return {
    score,
    verdict: typeof raw?.verdict === "string" && raw.verdict.trim() ? raw.verdict.trim().slice(0, 32) : verdictForScore(score),
    breakdown,
    rationale: String(raw?.rationale || "").replace(/\s+/g, " ").trim().slice(0, 600),
    strengths: Array.isArray(raw?.strengths) ? raw.strengths.slice(0, 4).map((s) => String(s).slice(0, 140)) : [],
    gaps: Array.isArray(raw?.gaps) ? raw.gaps.slice(0, 4).map((s) => String(s).slice(0, 140)) : [],
    provider,
    model,
    gradedAt: new Date().toISOString()
  };
}

function buildRequestBrief(input) {
  const plan = input.plan || {};
  const beats = (plan.beats || []).map((beat) => `${beat.label}: ${beat.caption}`);
  const probe = input.probe || {};
  const videoStream = (probe.streams || []).find((stream) => stream.codec_type === "video") || {};
  return {
    requestedPrompt: input.prompt || "",
    persona: input.persona || plan.audience || "",
    sideQuest: input.sideQuest || "",
    style: input.style || plan.styleName || "",
    aspect: input.aspect || "",
    targetDurationSeconds: input.targetDuration || null,
    renderedDurationSeconds: probe.format?.duration ? Number(probe.format.duration) : input.totalDuration || null,
    renderedResolution: videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : null,
    clipCount: input.clipCount || null,
    planTitle: plan.title || "",
    planThesis: plan.thesis || "",
    planBeats: beats
  };
}

const GRADER_INSTRUCTION = [
  "You are a strict creative QA grader for short-form video edits.",
  "Compare the RENDERED video (frames sampled in order) against the ORIGINAL request.",
  "Score 0-10 (10 = perfectly fulfils the exact request). Be honest; do not inflate.",
  "Sub-scores (each 0-10):",
  "- promptMatch: does the cut deliver what the prompt literally asked for?",
  "- visualQuality: framing, legibility of labels/captions, polish.",
  "- pacing: no-silence, momentum, fits target duration.",
  "- audienceFit: tone matches the stated persona/side quest.",
  "Return JSON only."
].join("\n");

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    verdict: { type: "string" },
    rationale: { type: "string" },
    breakdown: {
      type: "object",
      properties: {
        promptMatch: { type: "number" },
        visualQuality: { type: "number" },
        pacing: { type: "number" },
        audienceFit: { type: "number" }
      }
    },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } }
  },
  required: ["score", "breakdown", "rationale"]
};

async function extractFrames(videoPath, totalDuration, onLog) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "legend-grade-"));
  const duration = Number(totalDuration) > 0 ? Number(totalDuration) : 8;
  const rate = Math.max(0.2, FRAME_COUNT / Math.max(1, duration));

  try {
    await runProcess(
      resolveTool("ffmpeg"),
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        videoPath,
        "-vf",
        `fps=${rate.toFixed(4)},scale=${FRAME_WIDTH}:-2:flags=bilinear`,
        "-frames:v",
        String(FRAME_COUNT),
        "-q:v",
        "4",
        path.join(tmpDir, "frame-%02d.jpg")
      ],
      { onLog }
    );

    const files = (await fs.readdir(tmpDir)).filter((name) => name.endsWith(".jpg")).sort();
    const frames = [];
    for (const name of files.slice(0, FRAME_COUNT)) {
      const data = await fs.readFile(path.join(tmpDir, name));
      frames.push(data.toString("base64"));
    }
    return frames;
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function gradeWithGemini(brief, frames, onLog) {
  const key = geminiKey();
  const parts = [
    { text: `${GRADER_INSTRUCTION}\n\nORIGINAL REQUEST (JSON):\n${JSON.stringify(brief, null, 2)}\n\nFrames follow, sampled left-to-right in playback order:` }
  ];
  for (const frame of frames) {
    parts.push({ inline_data: { mime_type: "image/jpeg", data: frame } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: GRADE_SCHEMA
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini grader returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("") || "";
  if (!text) throw new Error("Gemini grader returned empty response");
  if (onLog) onLog(`Graded with ${GEMINI_MODEL} (${frames.length} frames)`);
  return normalizeGrade(JSON.parse(text), { provider: "gemini", model: GEMINI_MODEL });
}

async function gradeWithCloudflare(brief, onLog) {
  const account = cloudflareAccount();
  const token = cloudflareToken();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CF_MODEL}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messages: [
          { role: "system", content: `${GRADER_INSTRUCTION}\nYou only receive the edit metadata (no frames). Judge plan-vs-request fidelity and pacing from the numbers. Respond with strict JSON matching {score, verdict, rationale, breakdown:{promptMatch,visualQuality,pacing,audienceFit}, strengths:[], gaps:[]}.` },
          { role: "user", content: JSON.stringify(brief) }
        ],
        temperature: 0.2
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare grader returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }

  const data = await response.json();
  const raw = data.result?.response || data.result?.output_text || "";
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Cloudflare grader returned no JSON");
  if (onLog) onLog(`Graded with ${CF_MODEL} (metadata only)`);
  return normalizeGrade(JSON.parse(match[0]), { provider: "cloudflare", model: CF_MODEL });
}

// Deterministic fallback: never let a job finish ungraded.
function gradeHeuristically(brief) {
  const target = Number(brief.targetDurationSeconds) || 18;
  const rendered = Number(brief.renderedDurationSeconds) || target;
  const durationDelta = Math.abs(rendered - target) / Math.max(target, 1);
  const pacing = clampScore(10 - durationDelta * 12);

  const clips = Number(brief.clipCount) || 0;
  const visualQuality = clampScore(brief.renderedResolution ? (clips >= 3 ? 7.5 : 6) : 4);

  const promptWords = String(brief.requestedPrompt).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const planText = `${brief.planTitle} ${brief.planThesis} ${brief.planBeats.join(" ")}`.toLowerCase();
  const hits = new Set(promptWords.filter((word) => planText.includes(word)));
  const promptMatch = clampScore(promptWords.length ? 4 + (hits.size / promptWords.length) * 6 : 5);

  const personaText = `${brief.persona} ${brief.style} ${brief.sideQuest}`.toLowerCase();
  const audienceFit = clampScore(personaText.trim() && planText.includes(personaText.split(" ")[0]) ? 7 : 6);

  const breakdown = { promptMatch, visualQuality, pacing, audienceFit };
  const score = clampScore(BREAKDOWN_KEYS.reduce((sum, key) => sum + breakdown[key], 0) / BREAKDOWN_KEYS.length);

  return normalizeGrade(
    {
      score,
      breakdown,
      rationale: `Heuristic grade: rendered ${rendered.toFixed(1)}s vs target ${target}s, ${clips} clips, ${hits.size}/${promptWords.length} prompt keywords reflected in the plan. Configure LEGEND_GEMINI_API_KEY for a real multimodal grade.`,
      strengths: durationDelta < 0.2 ? ["Duration is on target"] : [],
      gaps: hits.size / Math.max(promptWords.length, 1) < 0.5 ? ["Plan only partially reflects the request"] : []
    },
    { provider: "heuristic", model: "deterministic" }
  );
}

async function gradeQuest(input, options = {}) {
  const { onLog } = options;
  const brief = buildRequestBrief(input);
  const tier = graderTier();

  if (tier.tier === "gemini" && input.finalVideo) {
    try {
      const frames = await extractFrames(input.finalVideo, brief.renderedDurationSeconds, onLog);
      if (frames.length) return await gradeWithGemini(brief, frames, onLog);
      if (onLog) onLog("Grader: no frames extracted, falling back");
    } catch (error) {
      if (onLog) onLog(`Gemini grade failed (${error.message}); trying next tier`);
    }
  }

  if (cloudflareAccount() && cloudflareToken()) {
    try {
      return await gradeWithCloudflare(brief, onLog);
    } catch (error) {
      if (onLog) onLog(`Cloudflare grade failed (${error.message}); using heuristic`);
    }
  }

  if (onLog) onLog("Grader: using deterministic heuristic");
  return gradeHeuristically(brief);
}

module.exports = { gradeQuest, graderTier };
