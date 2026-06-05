const fs = require("node:fs/promises");
const path = require("node:path");
const { resolveTool } = require("./ffmpegPaths");
const { analyzeVideos, buildTimeline, mediaSourcePath, roundTime } = require("./videoEngine");
const { createPromptPlan } = require("./promptPlanner");
const { runProcess } = require("./process");
const { parseRenderFraction } = require("../web/lib/jobProgress");

const HYPERFRAMES_VERSION = "0.6.70";
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return String(value || "side-quest")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "side-quest";
}

function dimensionsForAspect(aspect) {
  if (aspect === "landscape") return { width: 1920, height: 1080 };
  if (aspect === "square") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

async function hyperframesArgs(args) {
  const localBin = path.join(PROJECT_ROOT, "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes");
  try {
    await fs.access(localBin);
    return { command: localBin, args };
  } catch {
    return { command: "npx", args: ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args] };
  }
}

function packageJsonForProject(name) {
  return JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        check: `npx --yes hyperframes@${HYPERFRAMES_VERSION} lint && npx --yes hyperframes@${HYPERFRAMES_VERSION} inspect`,
        render: `npx --yes hyperframes@${HYPERFRAMES_VERSION} render`
      }
    },
    null,
    2
  );
}

function hyperframesConfig() {
  return JSON.stringify(
    {
      $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
      registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
      paths: {
        blocks: "compositions",
        components: "compositions/components",
        assets: "assets"
      }
    },
    null,
    2
  );
}

function mediaSummary(media) {
  return media.map((item) => ({
    title: item.title,
    duration: item.duration,
    width: item.width,
    height: item.height,
    hasAudio: item.hasAudio,
    audibleSegments: item.audibleSegments.length
  }));
}

function buildDesignMarkdown(plan, payload) {
  return `# Visual Identity

## Style Prompt

${plan.styleName}: ${plan.thesis}

## Quest Parameters

- Persona: ${payload.audience || "Gen Z"}
- Side quest: ${payload.sideQuest || "Hackathon proof"}${payload.questCategory ? ` (${payload.questCategory})` : ""}
- Difficulty: ${payload.questDifficulty || "medium"}${payload.questXp ? ` · ${payload.questXp} XP` : ""}
- Format: ${payload.aspect || "vertical"}
- Target duration: ${payload.targetDuration || 18}s

## Rules

- Remove repeated uploads by content hash before editing.
- Prefer audible spans.
- Pre-concat footage into one stable source track.
- Keep labels short enough to read while the cut keeps moving.
`;
}

function labelEntries(plan, timeline, totalDuration) {
  const beats = plan.beats && plan.beats.length ? plan.beats : [];
  const shots = timeline.length ? timeline : [{ start: 0, duration: totalDuration }];

  return shots.slice(0, 8).map((shot, index) => {
    const beat = beats[index % Math.max(1, beats.length)] || {};
    const start = roundTime(Math.min(shot.start + 0.18, Math.max(0, totalDuration - 1.2)));
    const end = roundTime(Math.min(shot.start + Math.max(1.15, shot.duration - 0.16), totalDuration - 0.1));

    return {
      id: `label-${index + 1}`,
      start,
      end: Math.max(start + 0.6, end),
      side: index % 2 === 0 ? "left" : "right",
      label: beat.label || (index === 0 ? "HOOK" : `BEAT ${index + 1}`),
      caption: beat.caption || "Keep the strongest moment."
    };
  });
}

function buildIndexHtml(plan, payload, timeline, baseVideoName) {
  const { width, height } = dimensionsForAspect(payload.aspect);
  const totalDuration = roundTime(timeline.reduce((sum, shot) => sum + shot.duration, 0));
  const palette = plan.palette || ["#050507", "#f8f3e7", "#24f5b5", "#ff3f81", "#ffd166"];
  const accent = palette[2] || "#24f5b5";
  const hot = palette[3] || "#ff3f81";
  const signal = palette[4] || "#ffd166";
  const title = escapeHtml(plan.title);
  const thesis = escapeHtml(plan.thesis);
  const labels = labelEntries(plan, timeline, totalDuration);
  const labelMarkup = labels
    .map((label) => `
      <div id="${label.id}" class="quest-label ${label.side}">
        <span>${escapeHtml(label.label)}</span>
        <strong>${escapeHtml(label.caption)}</strong>
      </div>`)
    .join("\n");
  const labelTweens = labels
    .map((label) => `
      tl.fromTo("#${label.id}", { opacity: 0, y: 28, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power3.out" }, ${label.start});
      tl.to("#${label.id}", { opacity: 0, y: -18, duration: 0.16, ease: "power2.in" }, ${Math.min(label.end, totalDuration - 0.08)});`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: ${palette[0]}; }
      #root {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        color: ${palette[1]};
        font-family: sans-serif;
        background: ${palette[0]};
      }
      video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
      }
      .shade {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(5,5,7,0.5), rgba(5,5,7,0.04) 38%, rgba(5,5,7,0.68)),
          radial-gradient(circle at 16% 13%, ${accent}35, transparent 31%),
          radial-gradient(circle at 88% 84%, ${hot}33, transparent 34%);
      }
      .frame {
        position: absolute;
        inset: ${height > width ? "48px" : "42px"};
        z-index: 4;
        border: 3px solid ${accent}90;
        box-shadow: inset 0 0 52px ${accent}22;
        pointer-events: none;
      }
      .topbar,
      .rail {
        position: absolute;
        left: ${height > width ? "48px" : "72px"};
        right: ${height > width ? "48px" : "72px"};
        z-index: 7;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        text-transform: uppercase;
        letter-spacing: 0;
        font-weight: 950;
        text-shadow: 0 3px 18px rgba(0,0,0,0.75);
      }
      .topbar { top: ${height > width ? "50px" : "46px"}; font-size: ${height > width ? "25px" : "20px"}; }
      .rail { bottom: ${height > width ? "50px" : "44px"}; font-size: ${height > width ? "17px" : "15px"}; }
      .mark {
        display: inline-block;
        width: 21px;
        height: 21px;
        margin-right: 14px;
        background: ${accent};
        box-shadow: 0 0 28px ${accent};
        vertical-align: -3px;
      }
      .timer { color: ${signal}; font-variant-numeric: tabular-nums; }
      .progress {
        width: ${height > width ? "230px" : "320px"};
        height: 8px;
        background: rgba(255,255,255,0.22);
        overflow: hidden;
      }
      .progress-fill {
        width: 100%;
        height: 100%;
        transform: scaleX(0);
        transform-origin: left center;
        background: linear-gradient(90deg, ${accent}, ${hot}, ${signal});
      }
      .source-rail {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        max-width: 74%;
      }
      .source-rail span {
        padding: 9px 11px;
        border: 1px solid rgba(255,255,255,0.24);
        background: rgba(0,0,0,0.42);
      }
      .title {
        position: absolute;
        left: ${height > width ? "52px" : "76px"};
        right: ${height > width ? "52px" : "76px"};
        top: ${height > width ? "164px" : "132px"};
        z-index: 6;
        opacity: 0;
      }
      .title h1 {
        max-width: ${height > width ? "930px" : "1280px"};
        font-size: ${height > width ? "102px" : "84px"};
        line-height: 0.94;
        letter-spacing: 0;
        font-weight: 950;
        text-shadow: 0 16px 60px rgba(0,0,0,0.72);
      }
      .title p {
        margin-top: 22px;
        max-width: ${height > width ? "800px" : "980px"};
        font-size: ${height > width ? "32px" : "26px"};
        line-height: 1.08;
        font-weight: 850;
        color: rgba(248,243,231,0.9);
      }
      .quest-label {
        position: absolute;
        z-index: 8;
        bottom: ${height > width ? "172px" : "116px"};
        width: ${height > width ? "780px" : "760px"};
        max-width: calc(100% - ${height > width ? "96px" : "144px"});
        padding: ${height > width ? "25px 28px" : "22px 24px"};
        opacity: 0;
        background: rgba(5,5,7,0.74);
        border: 2px solid rgba(255,255,255,0.28);
        box-shadow: 0 18px 54px rgba(0,0,0,0.48);
      }
      .quest-label.left { left: ${height > width ? "48px" : "72px"}; }
      .quest-label.right { right: ${height > width ? "48px" : "72px"}; }
      .quest-label span {
        display: block;
        margin-bottom: 11px;
        color: ${signal};
        font-size: ${height > width ? "21px" : "17px"};
        line-height: 1;
        font-weight: 950;
      }
      .quest-label strong {
        display: block;
        color: ${palette[1]};
        font-size: ${height > width ? "40px" : "30px"};
        line-height: 1.02;
        font-weight: 950;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${totalDuration}" data-width="${width}" data-height="${height}">
      <video id="video" data-start="0" data-duration="${roundTime(Math.max(0.1, totalDuration - 0.01))}" data-track-index="0" src="media/${escapeHtml(baseVideoName)}" muted playsinline></video>
      <audio id="audio" data-start="0" data-duration="${roundTime(Math.max(0.1, totalDuration - 0.01))}" data-track-index="1" src="media/${escapeHtml(baseVideoName)}" data-volume="1"></audio>
      <div class="shade" data-layout-ignore></div>
      <div class="frame" data-layout-ignore></div>
      <section class="title">
        <h1>${title}</h1>
        <p>${thesis}</p>
      </section>
      ${labelMarkup}
      <div class="topbar"><div><i class="mark"></i>${escapeHtml(plan.styleName)}</div><div class="timer">${totalDuration}S</div></div>
      <div class="rail"><div class="progress"><div class="progress-fill"></div></div></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(".title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0);
      tl.to(".title", { opacity: 0, y: -22, duration: 0.24, ease: "power2.in" }, ${Math.min(2.35, Math.max(0.9, totalDuration * 0.22))});
      tl.fromTo(".progress-fill", { scaleX: 0 }, { scaleX: 1, duration: ${totalDuration}, ease: "none" }, 0);
      ${labelTweens}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
}

function concatFilter(timeline, mediaById, aspect) {
  const { width, height } = dimensionsForAspect(aspect);
  const parts = [];
  const labels = [];

  timeline.forEach((shot, index) => {
    const media = mediaById.get(shot.mediaId);
    parts.push(
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`
    );

    if (media && media.hasAudio) {
      parts.push(`[${index}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`);
    } else {
      parts.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${shot.duration},asetpts=PTS-STARTPTS[a${index}]`);
    }

    labels.push(`[v${index}][a${index}]`);
  });

  parts.push(`${labels.join("")}concat=n=${timeline.length}:v=1:a=1[v][a]`);
  return parts.join(";");
}

async function createSideQuestProject(payload, options = {}) {
  const { onLog } = options;
  const onStage = options.onStage || (() => {});
  const videoPaths = (payload.videoPaths || []).filter(Boolean);

  if (!videoPaths.length) {
    throw new Error("Upload at least one unique photo or video.");
  }

  const outputRoot = payload.outputRoot || path.join(PROJECT_ROOT, "web-data", "runs");
  await fs.mkdir(outputRoot, { recursive: true });

  onStage("analyze", { status: "active", detail: `Probing ${videoPaths.length} clip${videoPaths.length === 1 ? "" : "s"}` });
  const media = await analyzeVideos(videoPaths, { onLog });
  onStage("analyze", { status: "done", detail: `${media.length} clip${media.length === 1 ? "" : "s"} analyzed` });

  onStage("select", { status: "active" });
  const plan = await createPromptPlan(
    {
      ...payload,
      mediaSummary: mediaSummary(media)
    },
    { onLog }
  );
  const timelineResult = buildTimeline(media, payload);

  if (!timelineResult.timeline.length) {
    throw new Error("No usable video segments were found.");
  }
  onStage("select", { status: "done", detail: `${timelineResult.timeline.length} moments selected` });

  const runName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(plan.title)}`;
  const projectDir = path.join(outputRoot, runName);
  const mediaDir = path.join(projectDir, "media");
  const rendersDir = path.join(projectDir, "renders");
  const baseVideoName = "side-quest-base.mp4";
  const baseVideo = path.join(mediaDir, baseVideoName);
  const finalVideo = path.join(rendersDir, "side-quest-final.mp4");
  const mediaById = new Map(media.map((item) => [item.id, item]));

  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });

  const inputArgs = timelineResult.timeline.flatMap((shot) => {
    const mediaItem = mediaById.get(shot.mediaId);
    return ["-ss", String(shot.mediaStart), "-t", String(shot.duration), "-i", mediaSourcePath(mediaItem)];
  });

  if (onLog) onLog(`Concatenating ${timelineResult.timeline.length} selected moments\n`);
  onStage("concat", { status: "active", detail: `Stitching ${timelineResult.timeline.length} clips` });
  await runProcess(
      resolveTool("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      ...inputArgs,
      "-filter_complex",
      concatFilter(timelineResult.timeline, mediaById, payload.aspect || "vertical"),
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-g",
      "24",
      "-keyint_min",
      "24",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      baseVideo
    ],
    { cwd: PROJECT_ROOT, onLog }
  );
  onStage("concat", { status: "done" });

  onStage("compose", { status: "active" });
  await fs.writeFile(path.join(projectDir, "package.json"), packageJsonForProject(runName));
  await fs.writeFile(path.join(projectDir, "hyperframes.json"), hyperframesConfig());
  await fs.writeFile(path.join(projectDir, "DESIGN.md"), buildDesignMarkdown(plan, payload));
  await fs.writeFile(path.join(projectDir, "index.html"), buildIndexHtml(plan, payload, timelineResult.timeline, baseVideoName));
  await fs.writeFile(
    path.join(projectDir, "source-manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        payload,
        plan,
        media,
        timeline: timelineResult.timeline,
        totalDuration: timelineResult.totalDuration
      },
      null,
      2
    )
  );

  if (onLog) onLog(`Generated HyperFrames project: ${projectDir}\n`);
  onStage("compose", { status: "done" });

  onStage("lint", { status: "active" });
  const lint = await hyperframesArgs(["lint"]);
  await runProcess(lint.command, lint.args, { cwd: projectDir, onLog });
  onStage("lint", { status: "done" });

  onStage("render", { status: "active", detail: `${payload.quality || "draft"} · ${payload.fps || 24}fps` });
  const onRenderLog = (line) => {
    if (onLog) onLog(line);
    const fraction = parseRenderFraction(String(line));
    if (fraction != null) onStage("render", { percent: fraction });
  };
  const render = await hyperframesArgs(["render", "--output", finalVideo, "--quality", payload.quality || "draft", "--fps", String(payload.fps || 24)]);
  await runProcess(render.command, render.args, { cwd: projectDir, onLog: onRenderLog });
  onStage("render", { status: "done" });

  return {
    projectDir,
    indexPath: path.join(projectDir, "index.html"),
    designPath: path.join(projectDir, "DESIGN.md"),
    manifestPath: path.join(projectDir, "source-manifest.json"),
    baseVideo,
    finalVideo,
    totalDuration: timelineResult.totalDuration,
    plan,
    media,
    clips: timelineResult.timeline
  };
}

module.exports = { createSideQuestProject };
