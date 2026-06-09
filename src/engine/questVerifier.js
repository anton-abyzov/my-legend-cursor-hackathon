// Quest proof verifier.
//
// The product is no longer "auto-edit a reel and grade it" — it is "the user
// claims they did a real-world side quest and uploads RAW proof; we decide
// whether the footage actually shows the claimed action." This module looks at
// the raw upload (never an edited render), asks a multimodal model an
// adversarial yes/no question across several frames, runs it more than once for
// stability, folds in provenance signals the model cannot reason about, and
// returns a PASS / FLAG / REJECT decision.
//
// Credibility of the whole product == how hard the PASS is to fake. The effort
// here is deliberately on (a) multi-pass agreement + confidence gating and
// (b) provenance (hash reuse, capture timestamp), NOT on a fancier prompt.

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveTool } = require("./ffmpegPaths");
const { runProcess } = require("./process");

const GEMINI_MODEL = process.env.LEGEND_GEMINI_MODEL || "gemini-flash-latest";
const FRAME_COUNT = Math.min(Math.max(Number(process.env.LEGEND_VERIFIER_FRAMES) || 8, 3), 16);
const FRAME_WIDTH = 640;
// How many independent verification passes to run. A single confident-but-wrong
// call is the main failure mode for a verifier, so default to agreement of 2.
const PASS_COUNT = Math.min(Math.max(Number(process.env.LEGEND_VERIFIER_PASSES) || 2, 1), 5);
// Confidence needed (averaged across passes) to auto-accept / auto-reject.
const PASS_CONFIDENCE = clamp01(Number(process.env.LEGEND_VERIFIER_PASS_CONFIDENCE) || 0.7);
const REJECT_CONFIDENCE = clamp01(Number(process.env.LEGEND_VERIFIER_REJECT_CONFIDENCE) || 0.6);
// Footage older than this (by capture timestamp) is treated as suspicious and
// can only FLAG, never auto-PASS. 0 disables the check.
const MAX_PROOF_AGE_DAYS = Math.max(Number(process.env.LEGEND_VERIFIER_MAX_AGE_DAYS) || 0, 0);

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function geminiKey() {
  return process.env.LEGEND_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
}

// Which verifier is wired up right now. Surfaced at startup and in /healthz.
function verifierTier() {
  if (geminiKey()) return { tier: "gemini", model: GEMINI_MODEL, multimodal: true };
  return { tier: "unconfigured", model: "none", multimodal: false };
}

const VERIFIER_INSTRUCTION = [
  "You are a STRICT proof verifier. A user CLAIMS they performed a specific",
  "real-world action and uploaded footage as proof. Looking ONLY at the frames",
  "provided (sampled in chronological order), decide whether there is genuine",
  "visual evidence the claimed action actually happened.",
  "",
  "Do NOT assume good faith. People try to pass off unrelated, staged, or",
  "downloaded footage. If the footage is ambiguous, only loosely related, or",
  "could plausibly be faked, set fulfilled=false and explain what evidence is",
  "missing. Reward only clear, specific, on-action evidence. Be honest about",
  "your confidence — do not inflate it.",
  "Return JSON only."
].join("\n");

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    fulfilled: { type: "boolean" },
    confidence: { type: "number" },
    evidence: { type: "string" },
    missing: { type: "string" }
  },
  required: ["fulfilled", "confidence", "evidence"]
};

// ── media probing ──────────────────────────────────────────────────────────

async function probeMedia(filePath) {
  try {
    const { stdout } = await runProcess(resolveTool("ffprobe"), [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration:format_tags=creation_time:stream=codec_type,width,height,tags",
      filePath
    ]);
    const parsed = JSON.parse(stdout);
    const streams = parsed.streams || [];
    const hasVideo = streams.some((s) => s.codec_type === "video");
    const duration = Number(parsed.format && parsed.format.duration);
    const capturedAt =
      parsed.format?.tags?.creation_time ||
      streams.map((s) => s.tags?.creation_time).find(Boolean) ||
      null;
    return {
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      kind: hasVideo ? "video" : "image",
      capturedAt: capturedAt || null
    };
  } catch (error) {
    return { duration: null, kind: "video", capturedAt: null, error: error.message };
  }
}

// Sample frames spread across the full clip (continuity over time is itself
// evidence). For a still image we just read the one frame.
async function extractFrames(filePath, kind, duration, onLog) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "legend-verify-"));
  try {
    if (kind === "image") {
      const out = path.join(tmpDir, "frame-01.jpg");
      await runProcess(
        resolveTool("ffmpeg"),
        ["-y", "-hide_banner", "-loglevel", "error", "-i", filePath, "-vf", `scale=${FRAME_WIDTH}:-2:flags=bilinear`, "-frames:v", "1", "-q:v", "4", out],
        { onLog }
      );
    } else {
      const seconds = Number(duration) > 0 ? Number(duration) : 8;
      const rate = Math.max(0.1, FRAME_COUNT / Math.max(1, seconds));
      await runProcess(
        resolveTool("ffmpeg"),
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          filePath,
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
    }

    const files = (await fs.readdir(tmpDir)).filter((n) => n.endsWith(".jpg")).sort();
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

// ── model pass ─────────────────────────────────────────────────────────────

function buildClaimBrief(input) {
  return {
    claim: input.claim || input.prompt || "",
    sideQuest: input.sideQuest || "",
    persona: input.persona || "",
    note: "Judge ONLY whether the frames prove the claim above actually happened."
  };
}

async function verifyPassGemini(brief, frames) {
  const key = geminiKey();
  const parts = [
    { text: `${VERIFIER_INSTRUCTION}\n\nCLAIM TO VERIFY (JSON):\n${JSON.stringify(brief, null, 2)}\n\nFrames follow, sampled chronologically:` }
  ];
  for (const frame of frames) parts.push({ inline_data: { mime_type: "image/jpeg", data: frame } });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        // Slightly non-zero so independent passes can genuinely disagree —
        // agreement across passes is the signal we gate on.
        generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: VERIFY_SCHEMA }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini verifier returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") || "";
  if (!text) throw new Error("Gemini verifier returned empty response");
  const raw = JSON.parse(text);
  return {
    fulfilled: Boolean(raw.fulfilled),
    confidence: clamp01(raw.confidence),
    evidence: String(raw.evidence || "").replace(/\s+/g, " ").trim().slice(0, 600),
    missing: String(raw.missing || "").replace(/\s+/g, " ").trim().slice(0, 400)
  };
}

// ── provenance ─────────────────────────────────────────────────────────────

function evaluateProvenance(input, probe) {
  const hashReused = Boolean(input.provenance && input.provenance.hashReused);
  const capturedAt = probe.capturedAt || null;
  const hasTimestamp = Boolean(capturedAt);
  let ageDays = null;
  if (capturedAt) {
    const t = Date.parse(capturedAt);
    if (Number.isFinite(t) && Number.isFinite(input.now)) {
      ageDays = Math.max(0, Math.round((input.now - t) / 86400000));
    }
  }
  const tooOld = MAX_PROOF_AGE_DAYS > 0 && ageDays != null && ageDays > MAX_PROOF_AGE_DAYS;
  return { hashReused, capturedAt, hasTimestamp, ageDays, tooOld };
}

// ── aggregation + decision ─────────────────────────────────────────────────

function aggregate(passes) {
  const yes = passes.filter((p) => p.fulfilled).length;
  const avgConfidence = passes.length
    ? passes.reduce((s, p) => s + p.confidence, 0) / passes.length
    : 0;
  // Prefer the most informative evidence string from the majority side.
  const majority = yes >= passes.length - yes;
  const sidePasses = passes.filter((p) => p.fulfilled === majority);
  const best = sidePasses.sort((a, b) => b.confidence - a.confidence)[0] || passes[0] || {};
  return {
    yes,
    total: passes.length,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    fulfilled: majority,
    evidence: best.evidence || "",
    missing: best.missing || ""
  };
}

function decide(agg, provenance) {
  // Reused proof is an automatic reject regardless of what the model sees —
  // someone is re-submitting footage that was already used.
  if (provenance.hashReused) {
    return { decision: "reject", reason: "This exact file was already submitted as proof." };
  }

  const unanimousYes = agg.yes === agg.total && agg.fulfilled;
  const unanimousNo = agg.yes === 0 && !agg.fulfilled;

  if (unanimousYes && agg.avgConfidence >= PASS_CONFIDENCE) {
    // Provenance can only downgrade a PASS to FLAG, never upgrade.
    if (!provenance.hasTimestamp) {
      return { decision: "flag", reason: "Action looks fulfilled, but the file has no capture timestamp — verify it is original." };
    }
    if (provenance.tooOld) {
      return { decision: "flag", reason: `Action looks fulfilled, but the footage is ~${provenance.ageDays}d old — confirm it is for this quest.` };
    }
    return { decision: "pass", reason: "Footage clearly shows the claimed action." };
  }

  if (unanimousNo && agg.avgConfidence >= REJECT_CONFIDENCE) {
    return { decision: "reject", reason: "Footage does not show the claimed action." };
  }

  // Split votes, low confidence, or conflicting signals → human review.
  return { decision: "flag", reason: "Evidence is ambiguous or the passes disagreed — needs a human look." };
}

// ── public entrypoint ──────────────────────────────────────────────────────

/**
 * @param {object} input  { proofPath, claim/prompt, sideQuest, persona,
 *                          provenance:{hashReused}, now:epochMs }
 * @param {object} options { onLog }
 * @returns verification object (always returns; never throws for normal flow)
 */
async function verifyQuest(input, options = {}) {
  const { onLog } = options;
  const tier = verifierTier();
  const brief = buildClaimBrief(input);
  const probe = await probeMedia(input.proofPath);
  const provenance = evaluateProvenance(input, probe);

  if (tier.tier !== "gemini") {
    // Be honest: with no model we cannot actually verify. Never auto-pass.
    if (onLog) onLog("Verifier: no LEGEND_GEMINI_API_KEY set — cannot verify, flagging for review");
    const decision = provenance.hashReused ? "reject" : "flag";
    return {
      decision,
      fulfilled: null,
      confidence: 0,
      evidence: "",
      missing: "No verifier model configured. Set LEGEND_GEMINI_API_KEY to enable AI verification.",
      reason: provenance.hashReused ? "This exact file was already submitted as proof." : "No verifier configured — sent to manual review.",
      provider: "none",
      model: "none",
      passes: [],
      provenance,
      verifiedAt: new Date().toISOString()
    };
  }

  let frames = [];
  try {
    frames = await extractFrames(input.proofPath, probe.kind, probe.duration, onLog);
  } catch (error) {
    if (onLog) onLog(`Verifier: frame extraction failed (${error.message}) — flagging`);
  }

  if (!frames.length) {
    return {
      decision: provenance.hashReused ? "reject" : "flag",
      fulfilled: null,
      confidence: 0,
      evidence: "",
      missing: "Could not read frames from the upload.",
      reason: "Unreadable proof — sent to manual review.",
      provider: "gemini",
      model: GEMINI_MODEL,
      passes: [],
      provenance,
      verifiedAt: new Date().toISOString()
    };
  }

  const passes = [];
  for (let i = 0; i < PASS_COUNT; i += 1) {
    try {
      const pass = await verifyPassGemini(brief, frames);
      passes.push(pass);
      if (onLog) onLog(`Verify pass ${i + 1}/${PASS_COUNT}: fulfilled=${pass.fulfilled} confidence=${pass.confidence}`);
    } catch (error) {
      if (onLog) onLog(`Verify pass ${i + 1} failed: ${error.message}`);
    }
  }

  if (!passes.length) {
    return {
      decision: "flag",
      fulfilled: null,
      confidence: 0,
      evidence: "",
      missing: "Verifier model did not respond.",
      reason: "Verifier unavailable — sent to manual review.",
      provider: "gemini",
      model: GEMINI_MODEL,
      passes: [],
      provenance,
      verifiedAt: new Date().toISOString()
    };
  }

  const agg = aggregate(passes);
  const { decision, reason } = decide(agg, provenance);

  return {
    decision,
    fulfilled: agg.fulfilled,
    confidence: agg.avgConfidence,
    evidence: agg.evidence,
    missing: agg.missing,
    reason,
    provider: "gemini",
    model: GEMINI_MODEL,
    passes: passes.map((p) => ({ fulfilled: p.fulfilled, confidence: p.confidence })),
    provenance,
    verifiedAt: new Date().toISOString()
  };
}

module.exports = { verifyQuest, verifierTier };
