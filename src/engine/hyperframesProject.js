const fs = require("node:fs/promises");
const path = require("node:path");
const { analyzeVideos, buildTimeline, copyMedia, roundTime } = require("./videoEngine");
const { createPromptPlan } = require("./promptPlanner");
const { runProcess } = require("./process");

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
  return String(value || "legend-cut")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 46) || "legend-cut";
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

function buildDesignMarkdown(plan, payload) {
  return `# Visual Identity

## Style Prompt

${plan.styleName}: ${plan.thesis}

## Colors

- Background: ${plan.palette[0]}
- Text: ${plan.palette[1]}
- Primary accent: ${plan.palette[2]}
- Hot accent: ${plan.palette[3] || "#ff4d8d"}
- Signal accent: ${plan.palette[4] || "#ffd166"}

## Typography

${plan.typography}

## Motion Rules

- Fast caption entrances, short exits, visible progress.
- No infinite loops.
- No dead-air title padding.
- Aspect: ${payload.aspect || "vertical"}.

## What NOT to Do

- Do not keep silent spans unless they are visually essential.
- Do not use generic stock title cards.
- Do not hide the source footage behind heavy blur.
- Do not make captions longer than one breath.
`;
}

function packageJsonForProject(name) {
  return JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        dev: `npx --yes hyperframes@${HYPERFRAMES_VERSION} preview`,
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

function captionForShot(plan, index) {
  const beat = plan.beats[index % plan.beats.length] || {};
  return {
    label: beat.label || `BEAT ${index + 1}`,
    caption: beat.caption || "Keep only the strongest moment."
  };
}

function buildIndexHtml(plan, timelineResult, payload) {
  const { timeline, totalDuration } = timelineResult;
  const { width, height } = dimensionsForAspect(payload.aspect);
  const palette = plan.palette;
  const accent = palette[2] || "#24f5b5";
  const hot = palette[3] || "#ff3f81";
  const signal = palette[4] || "#ffd166";
  const title = escapeHtml(plan.title);
  const thesis = escapeHtml(plan.thesis);
  const titleExitAt = roundTime(Math.min(2.6, totalDuration * 0.18));
  const compositionFont = "sans-serif";
  const shotsJson = JSON.stringify(timeline.map((shot) => ({
    id: shot.id,
    start: shot.start,
    duration: shot.duration
  })));

  const shotMarkup = timeline
    .map((shot, index) => {
      const number = String(index + 1).padStart(2, "0");
      const caption = captionForShot(plan, index);
      const mediaDuration = roundTime(Math.max(0.1, shot.duration - 0.01));
      return `
        <div class="shot-wrap shot-wrap-${number}">
          <video
            id="video-${number}"
            class="shot-video"
            data-start="${shot.start}"
            data-duration="${mediaDuration}"
            data-media-start="${shot.mediaStart}"
            data-track-index="0"
            src="${escapeHtml(shot.src)}"
            muted
            playsinline
          ></video>
        </div>
        <audio
          id="audio-${number}"
          data-start="${shot.start}"
          data-duration="${mediaDuration}"
          data-media-start="${shot.mediaStart}"
          data-track-index="1"
          src="${escapeHtml(shot.src)}"
          data-volume="1"
        ></audio>
        <div id="caption-${number}" class="caption caption-${index % 2 === 0 ? "left" : "right"}">
          <span>${escapeHtml(caption.label)}</span>
          <strong>${escapeHtml(caption.caption)}</strong>
        </div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html,
      body {
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: ${palette[0]};
      }

      #root {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        color: ${palette[1]};
        background:
          radial-gradient(circle at 20% 12%, ${hot}33, transparent 28%),
          radial-gradient(circle at 90% 88%, ${accent}2f, transparent 30%),
          linear-gradient(135deg, ${palette[0]} 0%, #11131a 48%, #050507 100%);
        font-family: ${compositionFont};
      }

      .shot-wrap {
        position: absolute;
        inset: 0;
        z-index: 1;
        overflow: hidden;
        background: transparent;
      }

      .shot-video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .grain {
        position: absolute;
        inset: 0;
        z-index: 4;
        pointer-events: none;
        opacity: 0.16;
        background-image:
          linear-gradient(0deg, transparent 0 47%, rgba(255,255,255,0.08) 48% 52%, transparent 53% 100%),
          linear-gradient(90deg, rgba(255,255,255,0.05), transparent 18%, rgba(255,255,255,0.04) 42%, transparent 70%);
        background-size: 100% 7px, 19px 100%;
        mix-blend-mode: overlay;
      }

      .pulse {
        position: absolute;
        inset: 6%;
        z-index: 2;
        border: 3px solid ${accent};
        opacity: 0.08;
        transform-origin: center;
      }

      .chrome {
        position: absolute;
        inset: 0;
        z-index: 8;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: ${height > width ? "54px 46px 58px" : "58px 72px"};
        pointer-events: none;
      }

      .topbar,
      .bottombar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        font-size: ${height > width ? "23px" : "20px"};
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        font-weight: 900;
      }

      .mark {
        width: 20px;
        height: 20px;
        background: ${accent};
        box-shadow: 0 0 24px ${accent};
      }

      .timecode {
        color: ${signal};
        font-variant-numeric: tabular-nums;
        font-weight: 800;
      }

      .source-rail {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        max-width: 76%;
      }

      .source-rail span {
        padding: 9px 12px;
        color: ${palette[1]};
        background: rgba(0,0,0,0.46);
        border: 1px solid rgba(255,255,255,0.22);
        font-size: ${height > width ? "17px" : "15px"};
        font-weight: 800;
      }

      .progress {
        width: ${height > width ? "180px" : "260px"};
        height: 8px;
        background: rgba(255,255,255,0.22);
        overflow: hidden;
      }

      .progress-fill {
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, ${accent}, ${hot}, ${signal});
        transform: scaleX(0);
        transform-origin: left center;
      }

      .title-card {
        position: absolute;
        z-index: 10;
        left: ${height > width ? "46px" : "72px"};
        right: ${height > width ? "46px" : "72px"};
        top: ${height > width ? "180px" : "150px"};
        opacity: 0;
      }

      .title-card h1 {
        max-width: ${height > width ? "900px" : "1320px"};
        font-size: ${height > width ? "112px" : "104px"};
        line-height: 0.92;
        font-weight: 950;
        letter-spacing: 0;
        color: ${palette[1]};
        text-wrap: balance;
        text-shadow: 0 12px 54px rgba(0,0,0,0.65);
      }

      .title-card p {
        margin-top: 24px;
        max-width: ${height > width ? "820px" : "980px"};
        font-size: ${height > width ? "34px" : "30px"};
        line-height: 1.14;
        font-weight: 750;
        color: rgba(255,255,255,0.86);
      }

      .caption {
        position: absolute;
        z-index: 12;
        bottom: ${height > width ? "168px" : "126px"};
        width: ${height > width ? "760px" : "860px"};
        max-width: calc(100% - 92px);
        padding: ${height > width ? "26px 28px" : "24px 28px"};
        color: ${palette[1]};
        background: rgba(5, 5, 7, 0.68);
        border: 2px solid rgba(255,255,255,0.24);
        box-shadow: 0 18px 56px rgba(0,0,0,0.42);
        opacity: 0;
      }

      .caption-left {
        left: ${height > width ? "46px" : "72px"};
      }

      .caption-right {
        right: ${height > width ? "46px" : "72px"};
      }

      .caption span {
        display: block;
        margin-bottom: 11px;
        color: ${signal};
        font-size: ${height > width ? "21px" : "18px"};
        line-height: 1;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .caption strong {
        display: block;
        color: ${palette[1]};
        font-size: ${height > width ? "40px" : "34px"};
        line-height: 1.02;
        font-weight: 950;
        letter-spacing: 0;
        text-wrap: balance;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${totalDuration}"
      data-width="${width}"
      data-height="${height}"
    >
      ${shotMarkup}
      <div class="pulse" data-layout-ignore></div>
      <div class="grain" data-layout-ignore></div>
      <section class="title-card">
        <h1>${title}</h1>
        <p>${thesis}</p>
      </section>
      <div class="chrome">
        <div class="topbar">
          <div class="brand"><i class="mark"></i><span>${escapeHtml(plan.styleName)}</span></div>
          <div class="timecode">${roundTime(totalDuration)}S</div>
        </div>
        <div class="bottombar">
          <div class="progress"><div class="progress-fill"></div></div>
        </div>
      </div>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const shots = ${shotsJson};
      const totalDuration = ${totalDuration};
      const pulseRepeats = Math.max(0, Math.ceil(totalDuration / 1.8) - 1);

      tl.fromTo(".title-card", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" }, 0);
      tl.to(".title-card", { opacity: 0, y: -20, duration: 0.28, ease: "power2.in" }, ${titleExitAt});
      tl.fromTo(".progress-fill", { scaleX: 0 }, { scaleX: 1, duration: totalDuration, ease: "none" }, 0);
      tl.to(".pulse", { opacity: 0.16, scale: 1.045, duration: 0.9, yoyo: true, repeat: pulseRepeats, ease: "sine.inOut" }, 0);

      shots.forEach((shot, index) => {
        const number = String(index + 1).padStart(2, "0");
        const caption = "#caption-" + number;
        const wrap = ".shot-wrap-" + number;
        const enter = shot.start + 0.12;
        const leave = Math.max(enter + 0.24, shot.start + shot.duration - 0.22);
        tl.fromTo(wrap, { scale: 1.035 }, { scale: 1, duration: shot.duration, ease: "none" }, shot.start);
        tl.fromTo(caption, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out" }, enter);
        tl.to(caption, { opacity: 0, y: -18, duration: 0.18, ease: "power2.in" }, leave);
      });

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

function mediaSummary(media) {
  return media.map((item) => ({
    title: item.title,
    duration: item.duration,
    width: item.width,
    height: item.height,
    audibleSegments: item.audibleSegments.length
  }));
}

async function createHyperframesProject(payload, options = {}) {
  const { onLog } = options;
  const videoPaths = (payload.videoPaths || []).filter(Boolean);

  if (!videoPaths.length) {
    throw new Error("Select at least one video.");
  }

  const outputRoot = payload.outputRoot || path.join(PROJECT_ROOT, "runs");
  await fs.mkdir(outputRoot, { recursive: true });

  const media = await analyzeVideos(videoPaths, { onLog });
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

  const runName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(plan.title)}`;
  const projectDir = path.join(outputRoot, runName);
  const mediaDir = path.join(projectDir, "media");
  const rendersDir = path.join(projectDir, "renders");

  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, "package.json"), packageJsonForProject(runName));
  await fs.writeFile(path.join(projectDir, "hyperframes.json"), hyperframesConfig());
  await fs.writeFile(path.join(projectDir, "DESIGN.md"), buildDesignMarkdown(plan, payload));
  await copyMedia(media, mediaDir);
  await fs.writeFile(path.join(projectDir, "index.html"), buildIndexHtml(plan, timelineResult, payload));
  await fs.writeFile(
    path.join(projectDir, "plan.json"),
    JSON.stringify({ plan, media, timeline: timelineResult.timeline, totalDuration: timelineResult.totalDuration }, null, 2)
  );

  if (onLog) onLog(`Generated HyperFrames project: ${projectDir}\n`);

  const hf = await hyperframesArgs(["lint"]);
  await runProcess(hf.command, hf.args, { cwd: projectDir, onLog });

  return {
    projectDir,
    indexPath: path.join(projectDir, "index.html"),
    planPath: path.join(projectDir, "plan.json"),
    designPath: path.join(projectDir, "DESIGN.md"),
    totalDuration: timelineResult.totalDuration,
    clips: timelineResult.timeline,
    media
  };
}

async function renderHyperframesProject(payload, options = {}) {
  const { onLog } = options;
  const projectDir = payload.projectDir;
  const quality = payload.quality || "draft";
  const fps = String(payload.fps || 30);

  if (!projectDir) {
    throw new Error("No HyperFrames project has been generated yet.");
  }

  const outputPath = path.join(projectDir, "renders", `legend-${quality}-${Date.now()}.mp4`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const lint = await hyperframesArgs(["lint"]);
  await runProcess(lint.command, lint.args, { cwd: projectDir, onLog });

  const render = await hyperframesArgs(["render", "--output", outputPath, "--quality", quality, "--fps", fps]);
  await runProcess(render.command, render.args, { cwd: projectDir, onLog });

  return {
    outputPath,
    projectDir
  };
}

module.exports = {
  createHyperframesProject,
  renderHyperframesProject
};
