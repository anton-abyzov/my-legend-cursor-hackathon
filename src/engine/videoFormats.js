const crypto = require("node:crypto");
const path = require("node:path");
const { resolveTool } = require("./ffmpegPaths");
const { runProcess } = require("./process");

const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const SUPPORTED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/x-matroska",
  "video/avi",
  "video/x-msvideo",
  "application/octet-stream"
]);

const DIRECT_VIDEO_CODECS = new Set(["h264"]);
const DIRECT_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis"]);

function extensionFromName(name) {
  return path.extname(String(name || "")).toLowerCase();
}

function isSupportedVideoUpload(name, mimeType) {
  const ext = extensionFromName(name);
  if (SUPPORTED_EXTENSIONS.has(ext)) return true;
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  return SUPPORTED_MIME_TYPES.has(mime) && mime.startsWith("video/");
}

function supportedFormatsLabel() {
  return "MP4, MOV, M4V, WebM, MKV, or AVI";
}

async function probeVideoFormat(filePath) {
  const { stdout } = await runProcess(resolveTool("ffprobe"), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=format_name:stream=codec_type,codec_name,pix_fmt",
    filePath
  ]);

  const parsed = JSON.parse(stdout);
  const streams = parsed.streams || [];
  const videoStream = streams.find((stream) => stream.codec_type === "video") || null;
  const audioStream = streams.find((stream) => stream.codec_type === "audio") || null;
  const formatName = String(parsed.format?.format_name || "").toLowerCase();
  const videoCodec = String(videoStream?.codec_name || "").toLowerCase();
  const audioCodec = String(audioStream?.codec_name || "").toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  const hasVideo = Boolean(videoStream);
  const hasDirectVideoCodec = DIRECT_VIDEO_CODECS.has(videoCodec);
  const hasDirectAudioCodec = !audioStream || DIRECT_AUDIO_CODECS.has(audioCodec);
  const hasBrowserSafePixelFormat = !videoStream || !videoStream.pix_fmt || videoStream.pix_fmt === "yuv420p";
  const isQuickTimeOrMp4 =
    formatName.includes("mov") ||
    formatName.includes("mp4") ||
    formatName.includes("m4v") ||
    ext === ".mp4" ||
    ext === ".mov" ||
    ext === ".m4v";

  const canUseDirectly = hasVideo && hasDirectVideoCodec && hasDirectAudioCodec && hasBrowserSafePixelFormat && (isQuickTimeOrMp4 || ext === ".webm");
  const container =
    ext === ".mov" ? "mov" : ext === ".m4v" ? "m4v" : ext === ".mp4" ? "mp4" : ext.replace(/^\./, "") || "unknown";

  return {
    hasVideo,
    videoCodec,
    audioCodec,
    formatName,
    container,
    canUseDirectly
  };
}

async function transcodeToMp4(inputPath, outputPath, onLog) {
  if (onLog) onLog(`Transcoding ${path.basename(inputPath)} to MP4\n`);
  await runProcess(
    resolveTool("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-i",
      inputPath,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      outputPath
    ],
    { onLog }
  );
}

async function prepareVideoInput(inputPath, options = {}) {
  const { onLog, cacheDir } = options;
  const format = await probeVideoFormat(inputPath);

  if (!format.hasVideo) {
    throw new Error(`${path.basename(inputPath)} has no readable video stream.`);
  }

  if (format.canUseDirectly) {
    if (onLog && format.container === "mov") {
      onLog(`Using ${path.basename(inputPath)} as-is (QuickTime/${format.videoCodec})\n`);
    }
    return { path: inputPath, converted: false, format };
  }

  const hash = crypto.createHash("sha1").update(inputPath).digest("hex").slice(0, 10);
  const outputPath = path.join(cacheDir || path.dirname(inputPath), `normalized-${hash}.mp4`);
  await transcodeToMp4(inputPath, outputPath, onLog);
  return { path: outputPath, converted: true, format };
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
  extensionFromName,
  isSupportedVideoUpload,
  supportedFormatsLabel,
  probeVideoFormat,
  prepareVideoInput,
  transcodeToMp4
};
