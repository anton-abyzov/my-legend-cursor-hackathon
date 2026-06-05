const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveTool } = require("./ffmpegPaths");
const { runProcess } = require("./process");
const { prepareVideoInput } = require("./videoFormats");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function toSafeName(filePath, index) {
  const ext = path.extname(filePath).toLowerCase() || ".mp4";
  const stem = path
    .basename(filePath, ext)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "clip";
  const hash = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 8);
  return `${String(index + 1).padStart(2, "0")}-${stem}-${hash}${ext}`;
}

function titleFromFile(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function probeVideo(filePath) {
  const { stdout } = await runProcess(resolveTool("ffprobe"), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=duration:stream=codec_type,width,height",
    filePath
  ]);

  const parsed = JSON.parse(stdout);
  const streams = parsed.streams || [];
  const videoStream = streams.find((stream) => stream.codec_type === "video") || {};
  const hasAudio = streams.some((stream) => stream.codec_type === "audio");
  const duration = Number(parsed.format && parsed.format.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration for ${path.basename(filePath)}`);
  }

  return {
    duration,
    width: Number(videoStream.width) || null,
    height: Number(videoStream.height) || null,
    hasAudio
  };
}

function parseSilence(stderr, duration) {
  const events = [];
  const startPattern = /silence_start:\s*([0-9.]+)/g;
  const endPattern = /silence_end:\s*([0-9.]+)/g;
  let match;

  while ((match = startPattern.exec(stderr))) {
    events.push({ type: "start", time: Number(match[1]) });
  }

  while ((match = endPattern.exec(stderr))) {
    events.push({ type: "end", time: Number(match[1]) });
  }

  events.sort((a, b) => a.time - b.time || (a.type === "start" ? -1 : 1));

  const silences = [];
  let activeStart = null;

  for (const event of events) {
    if (event.type === "start") {
      activeStart = event.time;
    } else if (activeStart !== null) {
      silences.push({
        start: clamp(activeStart, 0, duration),
        end: clamp(event.time, 0, duration)
      });
      activeStart = null;
    }
  }

  if (activeStart !== null) {
    silences.push({ start: clamp(activeStart, 0, duration), end: duration });
  }

  return silences.filter((silence) => silence.end - silence.start >= 0.25);
}

function audibleSegmentsFromSilence(silences, duration) {
  const segments = [];
  let cursor = 0;

  for (const silence of silences) {
    if (silence.start - cursor >= 0.75) {
      segments.push({ start: cursor, end: silence.start });
    }
    cursor = Math.max(cursor, silence.end);
  }

  if (duration - cursor >= 0.75) {
    segments.push({ start: cursor, end: duration });
  }

  if (!segments.length) {
    return [{ start: 0, end: duration }];
  }

  return segments.map((segment) => ({
    start: roundTime(clamp(segment.start + 0.08, 0, duration)),
    end: roundTime(clamp(segment.end - 0.08, 0, duration))
  })).filter((segment) => segment.end - segment.start >= 0.65);
}

async function detectAudibleSegments(filePath, duration, onLog) {
  try {
    const result = await runProcess(
      resolveTool("ffmpeg"),
      [
        "-hide_banner",
        "-nostats",
        "-i",
        filePath,
        "-af",
        "silencedetect=noise=-35dB:d=0.45",
        "-f",
        "null",
        "-"
      ],
      { onLog: null }
    );

    const silences = parseSilence(result.stderr, duration);
    return audibleSegmentsFromSilence(silences, duration);
  } catch (error) {
    if (onLog) onLog(`Silence detection skipped for ${path.basename(filePath)}: ${error.message}\n`);
    return [{ start: 0, end: duration }];
  }
}

async function analyzeVideos(videoPaths, options = {}) {
  const { onLog } = options;
  const media = [];
  const cacheDir = path.join(os.tmpdir(), "legend-video-cache");
  await fs.mkdir(cacheDir, { recursive: true });

  for (let index = 0; index < videoPaths.length; index += 1) {
    const originalPath = videoPaths[index];
    if (onLog) onLog(`Analyzing ${path.basename(originalPath)}\n`);

    const prepared = await prepareVideoInput(originalPath, { onLog, cacheDir });
    const workingPath = prepared.path;
    const probe = await probeVideo(workingPath);
    const audibleSegments = await detectAudibleSegments(workingPath, probe.duration, onLog);
    const safeName = toSafeName(workingPath, index);

    media.push({
      id: `media-${index + 1}`,
      originalPath,
      workingPath,
      converted: prepared.converted,
      safeName,
      title: titleFromFile(originalPath),
      duration: roundTime(probe.duration),
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio,
      audibleSegments
    });
  }

  return media;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 80);
}

function scoreCandidate(candidate, tokens, aspect) {
  const haystack = candidate.media.title.toLowerCase();
  const keywordHits = tokens.filter((token) => haystack.includes(token)).length;
  const verticalBonus = aspect === "vertical" && candidate.media.height > candidate.media.width ? 1.5 : 0;
  const landscapeBonus = aspect === "landscape" && candidate.media.width >= candidate.media.height ? 1.2 : 0;
  const lengthScore = Math.min(candidate.length, 8) / 2;
  return lengthScore + keywordHits * 3 + verticalBonus + landscapeBonus;
}

function buildTimeline(media, options = {}) {
  const prompt = options.prompt || "";
  const audience = String(options.audience || "").toLowerCase();
  const aspect = options.aspect || "vertical";
  const targetDuration = clamp(Number(options.targetDuration) || 30, 6, 120);
  const maxClipDuration = audience.includes("gen z") || audience.includes("tiktok") ? 2.8 : 4.4;
  const minClipDuration = targetDuration <= 10 ? 0.8 : 1.1;
  const tokens = tokenize(prompt);

  const candidates = [];
  media.forEach((item, mediaIndex) => {
    item.audibleSegments.forEach((segment, segmentIndex) => {
      const length = segment.end - segment.start;
      if (length >= minClipDuration) {
        candidates.push({
          media: item,
          mediaIndex,
          segmentIndex,
          start: segment.start,
          end: segment.end,
          length
        });
      }
    });
  });

  if (!candidates.length) {
    media.forEach((item, mediaIndex) => {
      candidates.push({
        media: item,
        mediaIndex,
        segmentIndex: 0,
        start: 0,
        end: item.duration,
        length: item.duration
      });
    });
  }

  candidates.sort((a, b) => scoreCandidate(b, tokens, aspect) - scoreCandidate(a, tokens, aspect));

  const timeline = [];
  let cursor = 0;
  let candidateCursor = 0;
  const useCounts = new Map();

  while (cursor < targetDuration - 0.2 && timeline.length < 48) {
    const candidate = candidates[candidateCursor % candidates.length];
    const key = `${candidate.media.id}:${candidate.segmentIndex}`;
    const used = useCounts.get(key) || 0;
    const remaining = targetDuration - cursor;
    const clipDuration = roundTime(Math.min(maxClipDuration, candidate.length, remaining));

    if (clipDuration < minClipDuration && timeline.length > 0) break;

    const availableSlack = Math.max(0, candidate.length - clipDuration);
    const offsetStep = availableSlack > 0 ? (used * maxClipDuration * 0.67) % availableSlack : 0;
    const mediaStart = roundTime(candidate.start + offsetStep);

    timeline.push({
      id: `shot-${String(timeline.length + 1).padStart(2, "0")}`,
      mediaId: candidate.media.id,
      src: `media/${candidate.media.safeName}`,
      sourceName: candidate.media.title,
      start: roundTime(cursor),
      duration: clipDuration,
      mediaStart,
      label: candidate.media.title || `Clip ${candidate.mediaIndex + 1}`
    });

    cursor = roundTime(cursor + clipDuration);
    useCounts.set(key, used + 1);
    candidateCursor += 1;
  }

  return {
    timeline,
    totalDuration: roundTime(timeline.reduce((sum, shot) => sum + shot.duration, 0))
  };
}

function mediaSourcePath(item) {
  return item.workingPath || item.originalPath;
}

async function copyMedia(media, mediaDir) {
  await fs.mkdir(mediaDir, { recursive: true });
  for (const item of media) {
    await fs.copyFile(mediaSourcePath(item), path.join(mediaDir, item.safeName));
  }
}

module.exports = {
  analyzeVideos,
  buildTimeline,
  copyMedia,
  mediaSourcePath,
  roundTime
};
