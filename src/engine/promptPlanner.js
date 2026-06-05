function cleanLine(value, fallback) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function shortTitle(prompt) {
  const firstLine = cleanLine(String(prompt || "").split(/\n/)[0], "Side Quest Reel");
  const lower = firstLine.toLowerCase();
  if (lower.includes("no-silence") && lower.includes("side quest")) return "No-Silence Side Quest Reel";
  if (lower.includes("cursor") && lower.includes("hackathon")) return "Cursor Hackathon Cut";
  if (firstLine.length <= 46) return firstLine;
  return `${firstLine.slice(0, 43).trim()}...`;
}

function keywords(prompt) {
  const stop = new Set([
    "about",
    "after",
    "before",
    "based",
    "video",
    "videos",
    "make",
    "with",
    "from",
    "that",
    "this",
    "into",
    "them",
    "should",
    "would",
    "there",
    "their"
  ]);

  return String(prompt || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !stop.has(word))
    .slice(0, 8);
}

function fallbackPlan(payload) {
  const prompt = payload.prompt || "";
  const audience = cleanLine(payload.audience, "Gen Z");
  const lower = `${audience} ${prompt}`.toLowerCase();
  const keyTerms = keywords(prompt);
  const isGenZ = lower.includes("gen z") || lower.includes("tiktok") || lower.includes("side quest");
  const isTechnical = lower.includes("technical") || lower.includes("demo") || lower.includes("cursor");
  const isHackathon = lower.includes("hackathon") || lower.includes("cursor");

  const palette = isGenZ
    ? ["#09090b", "#f8f3e7", "#24f5b5", "#ff3f81", "#ffd166"]
    : ["#0b1020", "#f6f7fb", "#6ee7ff", "#a7f36b", "#ffb86b"];

  const styleName = isGenZ
    ? "Gen Z side-quest chrome"
    : isTechnical
      ? "sharp technical demo chrome"
      : "cinematic prompt chrome";

  const captions = isHackathon
    ? [
        "Cursor Hackathon turned into a viral cut.",
        "WhatsApp clips, zero dead air.",
        "Prompt goes in. HyperFrames comes out.",
        "The side quest is the demo.",
        "Cut the silence. Keep the proof.",
        "Ship it before the timer hits zero."
      ]
    : [
        "Open on the highest-energy audible moment.",
        keyTerms[0] ? `Make ${keyTerms[0]} instantly readable.` : "Cut away from silence fast.",
        keyTerms[1] ? `Use ${keyTerms[1]} as the next proof beat.` : "Hold only what moves the story.",
        "Add a visible shift before attention drops.",
        keyTerms[2] ? `Bring back ${keyTerms[2]} as a callback.` : "Stack the strongest reactions.",
        "End on the clearest payoff."
      ];

  return {
    title: shortTitle(prompt),
    thesis: cleanLine(prompt, "Turn selected clips into a tight, no-silence HyperFrames edit."),
    audience,
    styleName,
    palette,
    typography: "SF Pro Display, Inter, system-ui, sans-serif",
    editRules: [
      "Prefer audible spans over silent spans.",
      "Use fast cuts unless the source moment is visually important.",
      "Keep captions short and punchy.",
      "Make every beat justify its seconds."
    ],
    beats: captions.map((caption, index) => ({
      label: isHackathon
        ? ["WAIT", "NO DEAD AIR", "PROMPT CUT", "SIDE QUEST", "PROOF", "SHIP"][index] || `VIRAL ${index + 1}`
        : index === 0 ? "HOOK" : index === captions.length - 1 ? "PAYOFF" : `BEAT ${index + 1}`,
      caption
    })),
    chrome: [
      { name: "Cut language", value: isGenZ ? "jump cuts, kinetic labels, hard progress rail" : "clean cuts, lower thirds, restrained motion" },
      { name: "Pacing", value: isGenZ ? "1-3 second clips" : "2-5 second clips" },
      { name: "Avoid", value: "silence, filler, long dead air, generic title cards" }
    ]
  };
}

function coercePlan(raw, payload) {
  const fallback = fallbackPlan(payload);
  if (!raw || typeof raw !== "object") return fallback;

  return {
    ...fallback,
    ...raw,
    title: cleanLine(raw.title, fallback.title),
    thesis: cleanLine(raw.thesis, fallback.thesis),
    audience: cleanLine(raw.audience, fallback.audience),
    styleName: cleanLine(raw.styleName, fallback.styleName),
    palette: Array.isArray(raw.palette) && raw.palette.length >= 3 ? raw.palette.slice(0, 5) : fallback.palette,
    beats: Array.isArray(raw.beats) && raw.beats.length ? raw.beats.slice(0, 10) : fallback.beats,
    chrome: Array.isArray(raw.chrome) ? raw.chrome.slice(0, 6) : fallback.chrome
  };
}

async function createPromptPlan(payload, options = {}) {
  const { onLog } = options;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) {
    return fallbackPlan(payload);
  }

  try {
    if (onLog) onLog(`Planning edit with ${model}\n`);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "Return compact JSON for a HyperFrames video edit plan. Be specific, avoid generic advice, and design for no-silence short-form pacing."
          },
          {
            role: "user",
            content: JSON.stringify({
              prompt: payload.prompt,
              audience: payload.audience,
              aspect: payload.aspect,
              targetDuration: payload.targetDuration,
              media: payload.mediaSummary
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "hyperframes_edit_plan",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                thesis: { type: "string" },
                audience: { type: "string" },
                styleName: { type: "string" },
                palette: { type: "array", items: { type: "string" } },
                typography: { type: "string" },
                editRules: { type: "array", items: { type: "string" } },
                beats: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      label: { type: "string" },
                      caption: { type: "string" }
                    },
                    required: ["label", "caption"]
                  }
                },
                chrome: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      value: { type: "string" }
                    },
                    required: ["name", "value"]
                  }
                }
              },
              required: ["title", "thesis", "audience", "styleName", "palette", "typography", "editRules", "beats", "chrome"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI planner returned ${response.status}`);
    }

    const data = await response.json();
    const text = data.output_text || data.output?.[0]?.content?.find((part) => part.type === "output_text")?.text;
    return coercePlan(JSON.parse(text), payload);
  } catch (error) {
    if (onLog) onLog(`AI planning skipped: ${error.message}\n`);
    return fallbackPlan(payload);
  }
}

module.exports = { createPromptPlan };
