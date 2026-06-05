const crypto = require("node:crypto");
const nodeFs = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { createSideQuestProject } = require("../engine/sideQuestProject");
const { runProcess } = require("../engine/process");
const { isSupportedVideoUpload, supportedFormatsLabel } = require("../engine/videoFormats");
const objectStorage = require("./lib/objectStorage");

function loadDotEnv(filePath = path.join(process.cwd(), ".env")) {
  if (!nodeFs.existsSync(filePath)) return;
  const lines = nodeFs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt <= 0) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 4317);
const BASE_PATH = normalizeBasePath(process.env.LEGEND_BASE_PATH || "");
const DATA_ROOT = path.resolve(process.env.LEGEND_DATA_DIR || path.join(process.cwd(), "web-data"));
const TMP_DIR = path.join(DATA_ROOT, "tmp");
const UPLOAD_ROOT = path.join(DATA_ROOT, "uploads");
const JOB_ROOT = path.join(DATA_ROOT, "jobs");
const RUNS_ROOT = path.join(DATA_ROOT, "runs");
const PUBLIC_ROOT = path.join(__dirname, "public");
const MAX_UPLOAD_MB = Number(process.env.LEGEND_MAX_UPLOAD_MB || 750);
const AUTH_USER = process.env.LEGEND_WEB_USER || "anton";
const AUTH_PASSWORD = process.env.LEGEND_WEB_PASSWORD || "";
const SESSION_SECRET = process.env.LEGEND_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_NAME = "legend_auth";

const app = express();
const router = express.Router();
const upload = multer({
  dest: TMP_DIR,
  limits: {
    files: 24,
    fileSize: MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter(req, file, callback) {
    if (isSupportedVideoUpload(file.originalname, file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Unsupported video format. Use ${supportedFormatsLabel()}.`));
  }
});

app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

function normalizeBasePath(value) {
  const cleaned = String(value || "").trim().replace(/\/+$/g, "");
  if (!cleaned || cleaned === "/") return "";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function mountPath(value) {
  return `${BASE_PATH}${value}`;
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const splitAt = part.indexOf("=");
      if (splitAt > 0) cookies[decodeURIComponent(part.slice(0, splitAt))] = decodeURIComponent(part.slice(splitAt + 1));
      return cookies;
    }, {});
}

function signUser(username) {
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(username).digest("hex");
  return `${username}.${signature}`;
}

function verifySession(value) {
  if (!value || !value.includes(".")) return null;
  const splitAt = value.lastIndexOf(".");
  const username = value.slice(0, splitAt);
  const expected = signUser(username);
  const expectedBuffer = Buffer.from(expected);
  const valueBuffer = Buffer.from(value);
  if (expectedBuffer.length !== valueBuffer.length) return null;
  return crypto.timingSafeEqual(expectedBuffer, valueBuffer) ? username : null;
}

function currentUser(req) {
  if (!AUTH_PASSWORD) {
    return { id: AUTH_USER, name: AUTH_USER, authMode: "dev" };
  }

  const cookies = parseCookies(req.headers.cookie);
  const username = verifySession(cookies[COOKIE_NAME]);
  return username ? { id: username, name: username, authMode: "password" } : null;
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  req.user = user;
  next();
}

function setSessionCookie(res, username) {
  const maxAge = 60 * 60 * 24 * 7;
  const secure = process.env.LEGEND_COOKIE_SECURE === "1" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(signUser(username))}; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function safeText(value, fallback = "") {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function safeFilename(name, index, hash) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".mp4";
  const stem = path
    .basename(name || "clip", ext)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44) || "clip";
  return `${String(index + 1).padStart(2, "0")}-${stem}-${hash.slice(0, 10)}${ext}`;
}

function jobPath(id) {
  return path.join(JOB_ROOT, `${id}.json`);
}

async function writeJob(job) {
  job.updatedAt = new Date().toISOString();
  await fs.mkdir(JOB_ROOT, { recursive: true });
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
}

async function readJob(id) {
  const file = await fs.readFile(jobPath(id), "utf8");
  return JSON.parse(file);
}

async function listJobs() {
  await fs.mkdir(JOB_ROOT, { recursive: true });
  const files = await fs.readdir(JOB_ROOT);
  const jobs = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          return JSON.parse(await fs.readFile(path.join(JOB_ROOT, file), "utf8"));
        } catch {
          return null;
        }
      })
  );
  return jobs
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function sha1File(filePath) {
  const hash = crypto.createHash("sha1");
  const file = await fs.open(filePath, "r");
  try {
    for await (const chunk of file.createReadStream()) hash.update(chunk);
  } finally {
    await file.close();
  }
  return hash.digest("hex");
}

async function ingestUploads(jobId, files) {
  const uploadDir = path.join(UPLOAD_ROOT, jobId);
  const seen = new Set();
  const uploads = [];
  const duplicates = [];

  await fs.mkdir(uploadDir, { recursive: true });

  for (const file of files || []) {
    const hash = await sha1File(file.path);
    if (seen.has(hash)) {
      duplicates.push({ originalName: file.originalname, hash, size: file.size });
      await fs.unlink(file.path).catch(() => {});
      continue;
    }

    seen.add(hash);
    const storedName = safeFilename(file.originalname, uploads.length, hash);
    const storedPath = path.join(uploadDir, storedName);
    await fs.rename(file.path, storedPath);
    const objectKey = `uploads/${jobId}/${storedName}`;
    const storage = await objectStorage.putFile(objectKey, storedPath, {
      contentType: file.mimetype || "application/octet-stream",
      metadata: {
        sha1: hash
      }
    });
    uploads.push({
      originalName: file.originalname,
      storedName,
      path: storedPath,
      objectKey: storage ? objectKey : null,
      storage,
      hash,
      size: file.size,
      mimeType: file.mimetype
    });
  }

  return { uploads, duplicates };
}

async function probeOutput(filePath) {
  try {
    const { stdout } = await runProcess("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration,size:stream=codec_type,width,height,r_frame_rate",
      filePath
    ]);
    return JSON.parse(stdout);
  } catch (error) {
    return { error: error.message };
  }
}

function urlForRunPath(filePath) {
  const rel = path.relative(RUNS_ROOT, filePath);
  return mountPath(`/outputs/${rel.split(path.sep).map(encodeURIComponent).join("/")}`);
}

function compactJob(job) {
  return {
    id: job.id,
    status: job.status,
    title: job.title,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    user: job.user,
    persona: job.persona,
    sideQuest: job.sideQuest,
    style: job.style,
    aspect: job.aspect,
    targetDuration: job.targetDuration,
    prompt: job.prompt,
    uploads: job.uploads.map((file) => ({
      originalName: file.originalName,
      storedName: file.storedName,
      objectKey: file.objectKey || null,
      storage: file.storage ? { provider: file.storage.provider, bucket: file.storage.bucket, key: file.storage.key } : null,
      hash: file.hash,
      size: file.size,
      mimeType: file.mimeType
    })),
    duplicateCount: job.duplicates.length,
    duplicates: job.duplicates,
    result: job.result || null,
    storageMode: job.storageMode || objectStorage.mode(),
    error: job.error || null,
    logTail: (job.logs || []).slice(-80)
  };
}

async function materializeUploads(job, onLog) {
  for (const upload of job.uploads) {
    try {
      await fs.access(upload.path);
    } catch {
      if (!upload.objectKey) throw new Error(`Missing local upload cache for ${upload.storedName}`);
      if (onLog) onLog(`Restoring ${upload.storedName} from object storage`);
      await objectStorage.downloadFile(upload.objectKey, upload.path);
    }
  }
}

async function runJob(jobId) {
  let job = await readJob(jobId);
  const logs = job.logs || [];
  const onLog = (line) => {
    const text = String(line || "").trimEnd();
    if (!text) return;
    logs.push(...text.split(/\n/).slice(-24));
    if (logs.length > 220) logs.splice(0, logs.length - 220);
  };

  try {
    job.status = "processing";
    job.logs = logs;
    onLog("Render started");
    await writeJob(job);
    await materializeUploads(job, onLog);

    const result = await createSideQuestProject(
      {
        videoPaths: job.uploads.map((file) => file.path),
        prompt: job.prompt,
        audience: job.persona,
        sideQuest: job.sideQuest,
        aspect: job.aspect,
        targetDuration: job.targetDuration,
        quality: "draft",
        fps: 24,
        outputRoot: RUNS_ROOT
      },
      { onLog }
    );

    const probe = await probeOutput(result.finalVideo);
    const outputKey = `outputs/${job.id}/side-quest-final.mp4`;
    const manifestKey = `outputs/${job.id}/source-manifest.json`;
    const indexKey = `outputs/${job.id}/index.html`;
    const outputStorage = await objectStorage.putFile(outputKey, result.finalVideo, {
      contentType: "video/mp4",
      metadata: { jobid: job.id }
    });
    const manifestStorage = await objectStorage.putFile(manifestKey, result.manifestPath, {
      contentType: "application/json",
      metadata: { jobid: job.id }
    });
    const indexStorage = await objectStorage.putFile(indexKey, result.indexPath, {
      contentType: "text/html",
      metadata: { jobid: job.id }
    });
    job = await readJob(jobId);
    job.logs = logs;
    job.status = "complete";
    job.storageMode = objectStorage.mode();
    job.result = {
      outputUrl: outputStorage ? objectStorage.appUrlForKey(outputKey, mountPath) : urlForRunPath(result.finalVideo),
      projectUrl: indexStorage ? objectStorage.appUrlForKey(indexKey, mountPath) : urlForRunPath(result.indexPath),
      manifestUrl: manifestStorage ? objectStorage.appUrlForKey(manifestKey, mountPath) : urlForRunPath(result.manifestPath),
      projectDir: result.projectDir,
      outputPath: result.finalVideo,
      outputObject: outputStorage,
      manifestObject: manifestStorage,
      indexObject: indexStorage,
      totalDuration: result.totalDuration,
      clipCount: result.clips.length,
      planTitle: result.plan.title,
      planStyle: result.plan.styleName,
      probe
    };
    onLog("Render complete");
    await writeJob(job);
  } catch (error) {
    job = await readJob(jobId).catch(() => job);
    job.logs = logs;
    job.status = "failed";
    job.error = error.stack || error.message;
    onLog(`Render failed: ${error.message}`);
    await writeJob(job);
  }
}

function sendApp(req, res) {
  fs.readFile(path.join(PUBLIC_ROOT, "index.html"), "utf8")
    .then((html) => {
      res.type("html").send(
        html
          .replace(/%BASE_PATH%/g, BASE_PATH)
          .replace(/%AUTH_REQUIRED%/g, AUTH_PASSWORD ? "true" : "false")
      );
    })
    .catch((error) => {
      res.status(500).send(error.message);
    });
}

router.get("/healthz", (req, res) => {
  res.json({ ok: true, basePath: BASE_PATH || "/", authRequired: Boolean(AUTH_PASSWORD), storage: objectStorage.mode() });
});

router.post("/api/login", (req, res) => {
  if (!AUTH_PASSWORD || req.body?.password === AUTH_PASSWORD) {
    setSessionCookie(res, AUTH_USER);
    res.json({ ok: true, user: { id: AUTH_USER, name: AUTH_USER } });
    return;
  }

  res.status(401).json({ error: "bad_password" });
});

router.post("/api/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/api/me", (req, res) => {
  const user = currentUser(req);
  res.json({
    authenticated: Boolean(user),
    authRequired: Boolean(AUTH_PASSWORD),
    user
  });
});

router.get("/api/quests", requireUser, async (req, res, next) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs: jobs.map(compactJob) });
  } catch (error) {
    next(error);
  }
});

router.get("/api/quests/:id", requireUser, async (req, res, next) => {
  try {
    const job = await readJob(req.params.id);
    res.json({ job: compactJob(job) });
  } catch (error) {
    next(error);
  }
});

router.get("/api/storage", requireUser, async (req, res, next) => {
  try {
    await objectStorage.streamObject(req.query.key, res);
  } catch (error) {
    next(error);
  }
});

router.post("/api/quests", requireUser, upload.array("videos", 24), async (req, res, next) => {
  try {
    const id = crypto.randomUUID();
    const { uploads, duplicates } = await ingestUploads(id, req.files);

    if (!uploads.length) {
      res.status(400).json({ error: "no_unique_videos", duplicates });
      return;
    }

    const title = safeText(req.body.title, "Untitled side quest").slice(0, 96);
    const persona = safeText(req.body.persona, "Gen Z").slice(0, 80);
    const sideQuest = safeText(req.body.sideQuest, "Hackathon proof").slice(0, 80);
    const style = safeText(req.body.style, "fast viral proof").slice(0, 80);
    const aspect = ["vertical", "landscape", "square"].includes(req.body.aspect) ? req.body.aspect : "vertical";
    const targetDuration = Math.min(Math.max(Number(req.body.targetDuration) || 18, 6), 60);
    const prompt = safeText(req.body.prompt, `${sideQuest} for ${persona}: ${style}.`).slice(0, 4000);
    const now = new Date().toISOString();
    const job = {
      id,
      status: "queued",
      title,
      createdAt: now,
      updatedAt: now,
      user: req.user,
      persona,
      sideQuest,
      style,
      aspect,
      targetDuration,
      prompt,
      uploads,
      duplicates,
      logs: [`Queued ${uploads.length} unique upload${uploads.length === 1 ? "" : "s"}`]
    };
    job.storageMode = objectStorage.mode();

    await writeJob(job);
    res.status(202).json({ job: compactJob(job) });
    setImmediate(() => runJob(id));
  } catch (error) {
    next(error);
  }
});

router.use("/assets", express.static(PUBLIC_ROOT, { immutable: false, maxAge: "1m" }));
router.use("/outputs", express.static(RUNS_ROOT, { fallthrough: false }));
router.get("/", sendApp);
router.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/") && !req.path.startsWith("/outputs/") && !req.path.startsWith("/assets/")) {
    sendApp(req, res);
    return;
  }
  next();
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.code, message: error.message });
    return;
  }
  if (error && /unsupported video format/i.test(error.message)) {
    res.status(400).json({ error: "unsupported_video_format", message: error.message });
    return;
  }
  res.status(500).json({ error: "server_error", message: error.message });
});

async function main() {
  await Promise.all([fs.mkdir(TMP_DIR, { recursive: true }), fs.mkdir(UPLOAD_ROOT, { recursive: true }), fs.mkdir(JOB_ROOT, { recursive: true }), fs.mkdir(RUNS_ROOT, { recursive: true })]);
  app.use(BASE_PATH || "/", router);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Legend web server listening on http://0.0.0.0:${PORT}${BASE_PATH || "/"}`);
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
