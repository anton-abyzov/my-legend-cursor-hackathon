const fs = require("node:fs/promises");
const path = require("node:path");
const { runProcess } = require("../src/engine/process");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "sources", "whatsapp-hackathon", "unique-clean");
const runDir = path.join(root, "runs", `whatsapp-hackathon-viral-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const mediaDir = path.join(runDir, "media");
const rendersDir = path.join(runDir, "renders");
const baseVideo = path.join(mediaDir, "whatsapp-hackathon-base.mp4");
const finalVideo = path.join(rendersDir, "whatsapp-hackathon-viral.mp4");

const sources = [
  path.join(sourceDir, "whatsapp-hackathon-01.mp4"),
  path.join(sourceDir, "whatsapp-hackathon-02.mp4"),
  path.join(sourceDir, "whatsapp-hackathon-03.mp4"),
  path.join(sourceDir, "whatsapp-hackathon-04.mp4")
];

const segmentDuration = 4;
const totalDuration = sources.length * segmentDuration;

const labels = [
  ["WAIT", "WhatsApp cache had the whole demo."],
  ["NO DEAD AIR", "Four clips. Zero filler."],
  ["PROMPT CUT", "Describe the vibe, ship the edit."],
  ["SIDE QUEST", "Hackathon footage became content."],
  ["PROOF", "HyperFrames adds the viral chrome."],
  ["SHIP", "This is the test cut."]
];

function html() {
  const labelTweens = labels
    .map((label, index) => {
      const start = Math.min(index * 2.45 + 0.45, totalDuration - 2);
      const out = Math.min(start + 2.05, totalDuration - 0.25);
      return `
      tl.fromTo("#label-${index + 1}", { opacity: 0, y: 28, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: "power3.out" }, ${start.toFixed(2)});
      tl.to("#label-${index + 1}", { opacity: 0, y: -18, duration: 0.16, ease: "power2.in" }, ${out.toFixed(2)});`;
    })
    .join("\n");

  const labelMarkup = labels
    .map((label, index) => `
      <div id="label-${index + 1}" class="viral-label ${index % 2 === 0 ? "left" : "right"}">
        <span>${label[0]}</span>
        <strong>${label[1]}</strong>
      </div>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #050507; }
      #root {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        color: #f8f3e7;
        font-family: sans-serif;
        background: #050507;
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
          linear-gradient(180deg, rgba(5,5,7,0.42), rgba(5,5,7,0.02) 35%, rgba(5,5,7,0.62)),
          radial-gradient(circle at 15% 14%, rgba(36,245,181,0.24), transparent 30%),
          radial-gradient(circle at 88% 80%, rgba(255,63,129,0.24), transparent 32%);
      }
      .frame {
        position: absolute;
        inset: 48px;
        z-index: 4;
        border: 3px solid rgba(36,245,181,0.55);
        box-shadow: inset 0 0 54px rgba(36,245,181,0.13);
        pointer-events: none;
      }
      .topbar,
      .rail {
        position: absolute;
        left: 48px;
        right: 48px;
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
      .topbar { top: 50px; font-size: 26px; }
      .rail { bottom: 50px; font-size: 18px; }
      .mark {
        display: inline-block;
        width: 22px;
        height: 22px;
        margin-right: 14px;
        background: #24f5b5;
        box-shadow: 0 0 28px #24f5b5;
        vertical-align: -3px;
      }
      .timer { color: #ffd166; font-variant-numeric: tabular-nums; }
      .progress {
        width: 250px;
        height: 8px;
        background: rgba(255,255,255,0.22);
        overflow: hidden;
      }
      .progress-fill {
        width: 100%;
        height: 100%;
        transform: scaleX(0);
        transform-origin: left center;
        background: linear-gradient(90deg, #24f5b5, #ff3f81, #ffd166);
      }
      .source-chip {
        padding: 9px 12px;
        border: 1px solid rgba(255,255,255,0.24);
        background: rgba(0,0,0,0.42);
      }
      .title {
        position: absolute;
        left: 52px;
        right: 52px;
        top: 164px;
        z-index: 6;
        opacity: 0;
      }
      .title h1 {
        max-width: 930px;
        font-size: 112px;
        line-height: 0.92;
        letter-spacing: 0;
        font-weight: 950;
        text-shadow: 0 16px 60px rgba(0,0,0,0.72);
      }
      .title p {
        margin-top: 24px;
        max-width: 800px;
        font-size: 34px;
        line-height: 1.08;
        font-weight: 850;
        color: rgba(248,243,231,0.9);
      }
      .viral-label {
        position: absolute;
        z-index: 8;
        bottom: 172px;
        width: 780px;
        max-width: calc(100% - 96px);
        padding: 26px 28px;
        opacity: 0;
        background: rgba(5,5,7,0.74);
        border: 2px solid rgba(255,255,255,0.28);
        box-shadow: 0 18px 54px rgba(0,0,0,0.48);
      }
      .viral-label.left { left: 48px; }
      .viral-label.right { right: 48px; }
      .viral-label span {
        display: block;
        margin-bottom: 12px;
        color: #ffd166;
        font-size: 22px;
        line-height: 1;
        font-weight: 950;
      }
      .viral-label strong {
        display: block;
        color: #f8f3e7;
        font-size: 42px;
        line-height: 1.02;
        font-weight: 950;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${totalDuration}" data-width="1080" data-height="1920">
      <video id="video" data-start="0" data-duration="${(totalDuration - 0.01).toFixed(2)}" data-track-index="0" src="media/whatsapp-hackathon-base.mp4" muted playsinline></video>
      <audio id="audio" data-start="0" data-duration="${(totalDuration - 0.01).toFixed(2)}" data-track-index="1" src="media/whatsapp-hackathon-base.mp4" data-volume="1"></audio>
      <div class="shade" data-layout-ignore></div>
      <div class="frame" data-layout-ignore></div>
      <section class="title">
        <h1>WhatsApp Cache to Hackathon Cut</h1>
        <p>Four hidden test clips turned into a no-silence HyperFrames proof.</p>
      </section>
      ${labelMarkup}
      <div class="topbar"><div><i class="mark"></i>Cursor Hackathon Mode</div><div class="timer">16S</div></div>
      <div class="rail"><div><span class="source-chip">01 CACHE</span> <span class="source-chip">02 PROMPT</span> <span class="source-chip">03 CUT</span> <span class="source-chip">04 SHIP</span></div><div class="progress"><div class="progress-fill"></div></div></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(".title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0);
      tl.to(".title", { opacity: 0, y: -22, duration: 0.24, ease: "power2.in" }, 2.35);
      tl.fromTo(".progress-fill", { scaleX: 0 }, { scaleX: 1, duration: ${totalDuration}, ease: "none" }, 0);
      ${labelTweens}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
}

async function writeProject() {
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });

  const inputs = sources.flatMap((source) => ["-t", String(segmentDuration), "-i", source]);
  const filters = sources
    .map((_, index) => {
      return `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${index}];` +
        `[${index}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`;
    })
    .join(";") +
    ";" +
    sources.map((_, index) => `[v${index}][a${index}]`).join("") +
    `concat=n=${sources.length}:v=1:a=1[v][a]`;

  await runProcess("ffmpeg", [
    "-y",
    "-hide_banner",
    ...inputs,
    "-filter_complex",
    filters,
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
  ], { cwd: root, onLog: (line) => process.stdout.write(line) });

  await fs.writeFile(path.join(runDir, "package.json"), JSON.stringify({
    name: path.basename(runDir),
    private: true,
    type: "module",
    scripts: {
      check: "npx --yes hyperframes@0.6.70 lint && npx --yes hyperframes@0.6.70 inspect",
      render: "npx --yes hyperframes@0.6.70 render"
    }
  }, null, 2));
  await fs.writeFile(path.join(runDir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }
  }, null, 2));
  await fs.writeFile(path.join(runDir, "DESIGN.md"), `# Visual Identity

## Style Prompt
Neon Gen Z hackathon side quest: urgent, high-contrast, viral label overlays, no dead air.

## Colors
- Background: #050507
- Text: #f8f3e7
- Primary accent: #24f5b5
- Hot accent: #ff3f81
- Signal accent: #ffd166

## Typography
sans-serif

## What NOT to Do
- No beige startup deck styling.
- No quiet documentary lower thirds.
- No duplicated clips.
- No silence padding.
`);
  await fs.writeFile(path.join(runDir, "source-manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    sources,
    segmentDuration,
    totalDuration,
    labels
  }, null, 2));
  await fs.writeFile(path.join(runDir, "index.html"), html());
}

async function hyperframes(commandArgs) {
  const localBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes");
  await runProcess(localBin, commandArgs, { cwd: runDir, onLog: (line) => process.stdout.write(line) });
}

(async () => {
  await writeProject();
  await hyperframes(["lint"]);
  await hyperframes(["render", "--output", finalVideo, "--quality", "draft", "--fps", "24"]);
  console.log(JSON.stringify({ runDir, baseVideo, finalVideo }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
