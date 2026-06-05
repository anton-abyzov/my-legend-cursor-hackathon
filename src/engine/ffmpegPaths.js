const { execFileSync } = require("node:child_process");

const cache = {};

function pathWorks(command) {
  try {
    execFileSync(command, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installerPath(name) {
  try {
    if (name === "ffmpeg") return require("@ffmpeg-installer/ffmpeg").path;
    if (name === "ffprobe") return require("@ffprobe-installer/ffprobe").path;
  } catch {
    return null;
  }
  return null;
}

function resolveTool(name) {
  if (cache[name]) return cache[name];

  const envKey = name === "ffmpeg" ? "FFMPEG_PATH" : name === "ffprobe" ? "FFPROBE_PATH" : null;
  if (envKey && process.env[envKey]) {
    cache[name] = process.env[envKey];
    return cache[name];
  }

  if (pathWorks(name)) {
    cache[name] = name;
    return cache[name];
  }

  const installed = installerPath(name);
  if (installed) {
    cache[name] = installed;
    return cache[name];
  }

  cache[name] = name;
  return cache[name];
}

module.exports = { resolveTool };
