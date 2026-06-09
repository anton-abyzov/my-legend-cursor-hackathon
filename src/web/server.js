const crypto = require("node:crypto");
const nodeFs = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
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

const { verifyQuest, verifierTier } = require("../engine/questVerifier");
const objectStorage = require("./lib/objectStorage");
const jobProgress = require("./lib/jobProgress");
const analytics = require("./lib/analytics");
const questStore = require("./lib/questStore");
const authStore = require("./lib/authStore");
const proofLedger = require("./lib/proofLedger");

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
    // Cross-submission provenance: was this exact file ever submitted as proof
    // before? `record` returns true if the hash already existed in the ledger.
    const reused = await proofLedger.record(hash, jobId);
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
      reused,
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

// Make the raw proof servable for the share/verdict screens. With object
// storage we push it under the allowlisted `outputs/` prefix; locally we copy it
// into RUNS_ROOT so the existing /outputs static route serves it. We never edit
// the file — the user shares their own footage with a verified badge.
async function publishProof(job, upload) {
  const ext = path.extname(upload.storedName) || "";
  const key = `outputs/${job.id}/proof${ext}`;
  const storage = await objectStorage.putFile(key, upload.path, {
    contentType: upload.mimeType || "application/octet-stream",
    metadata: { jobid: job.id }
  });
  if (storage) return objectStorage.appUrlForKey(key, mountPath);
  const localDir = path.join(RUNS_ROOT, job.id);
  await fs.mkdir(localDir, { recursive: true });
  const localPath = path.join(localDir, `proof${ext}`);
  await fs.copyFile(upload.path, localPath);
  return urlForRunPath(localPath);
}

function compactShare(job) {
  // Only a verified (PASS) proof is shareable — the badge must mean something.
  if (job.status !== "complete" || job.verification?.decision !== "pass") return null;
  return {
    jobId: job.id,
    title: job.sideQuest || job.title,
    questSlug: job.questSlug || null,
    traveler: job.persona || null,
    proofUrl: job.result?.proofUrl || null,
    proofKind: job.result?.proofKind || "video",
    decision: job.verification.decision,
    confidence: job.verification.confidence ?? null,
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
      reused: Boolean(file.reused),
      size: file.size,
      mimeType: file.mimeType
    })),
    duplicateCount: job.duplicates.length,
    duplicates: job.duplicates,
    result: job.result || null,
    verification: job.verification || null,
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
    onLog("Verification started");
    await flush();
    await materializeUploads(job, onLog, onStage);

    // The proof is the user's raw upload. If they sent several files we verify
    // the first as the primary proof (the screen shows that clip). No editing.
    const primary = job.uploads[0];
    job.storageMode = objectStorage.mode();

    onStage("verify", { status: "active" });
    onLog("Verifying the proof against the claim");

    const verification = await verifyQuest(
      {
        proofPath: primary.path,
        claim: job.prompt,
        sideQuest: job.sideQuest,
        persona: job.persona,
        provenance: { hashReused: job.uploads.some((file) => file.reused) },
        now: Date.now()
      },
      { onLog }
    );
    job.verification = verification;

    // Make the raw proof shareable regardless of decision (the UI gates on the
    // decision itself). Best-effort — a publish failure must not fail the job.
    let proofUrl = null;
    try {
      proofUrl = await publishProof(job, primary);
    } catch (error) {
      onLog(`Could not publish proof for sharing: ${error.message}`);
    }
    job.result = {
      proofUrl,
      proofKind: String(primary.mimeType || "").startsWith("image/") ? "image" : "video",
      proofName: primary.originalName
    };

    onLog(`Verdict: ${verification.decision.toUpperCase()} (confidence ${verification.confidence}) — ${verification.reason || ""}`.trim());
    await analytics.recordVerification(job, verification).catch(() => {});

    // Only a PASS counts as a real completion / earns XP. Flagged and rejected
    // proofs do not advance the traveler.
    if (job.questSlug && verification.decision === "pass") {
      questStore
        .recordCompletion({
          slug: job.questSlug,
          jobId: job.id,
          gradeScore: Math.round(verification.confidence * 100) / 10, // 0-10 scale for legacy progress aggregation
          xpEarned: job.questXp || 0,
          surface: "web",
          userId: job.user?.id || null,
          decision: verification.decision,
          confidence: verification.confidence,
          evidence: verification.evidence,
          sourceHash: primary.hash
        })
        .catch(() => {});
    }

    onStage("verify", { status: "done", detail: `${verification.decision} · ${Math.round((verification.confidence || 0) * 100)}%` });

    job.status = "complete";
    jobProgress.finishProgress(job.progress, "complete");
    await persist(true);
  } catch (error) {
    job.logs = logs;
    job.status = "failed";
    job.error = error.stack || error.message;
    jobProgress.finishProgress(job.progress, "failed");
    onLog(`Verification failed: ${error.message}`);
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
  res.json({ ok: true, basePath: BASE_PATH || "/", authRequired: AUTH_REQUIRED, authMode: AUTH_MODE, storage: objectStorage.mode(), quests: questStore.mode(), verifier: verifierTier() });
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
    res.json({ verifier: verifierTier(), ...(await analytics.summary()) });
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
  proofLedger.init(DATA_ROOT);
  const tier = verifierTier();
  app.use(BASE_PATH || "/", router);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Legend web server listening on http://0.0.0.0:${PORT}${BASE_PATH || "/"}`);
    console.log(`Quest verifier: ${tier.tier} (${tier.model})${tier.multimodal ? " [multimodal]" : ""}`);
    if (tier.tier !== "gemini") {
      console.log("  Set LEGEND_GEMINI_API_KEY to enable AI proof verification. Without it every proof is flagged for manual review.");
    }
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
