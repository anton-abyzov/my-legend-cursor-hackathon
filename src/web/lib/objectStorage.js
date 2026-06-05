const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const provider = String(process.env.LEGEND_STORAGE_PROVIDER || "auto").toLowerCase();
const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "";
const bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.R2_BUCKET || process.env.LEGEND_R2_BUCKET || "legend-sidequests";
const publicBaseUrl = String(process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/g, "");

const r2Configured = Boolean(accountId && accessKeyId && secretAccessKey && bucket);
const enabled = provider === "r2" || (provider === "auto" && r2Configured);
const client = enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })
  : null;

function isEnabled() {
  return enabled;
}

function mode() {
  if (enabled) return { provider: "r2", bucket, public: Boolean(publicBaseUrl) };
  return { provider: "local" };
}

function normalizeKey(key) {
  return String(key || "")
    .replace(/^\/+/g, "")
    .replace(/\\/g, "/")
    .replace(/\.\.+/g, ".");
}

async function putFile(key, filePath, options = {}) {
  if (!enabled) return null;
  const normalized = normalizeKey(key);
  const uploader = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: normalized,
      Body: fs.createReadStream(filePath),
      ContentType: options.contentType || "application/octet-stream",
      Metadata: options.metadata || undefined
    }
  });

  await uploader.done();
  return { provider: "r2", bucket, key: normalized, url: publicUrl(normalized) };
}

async function downloadFile(key, filePath) {
  if (!enabled) return false;
  const normalized = normalizeKey(key);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: normalized }));
  await pipeline(response.Body, fs.createWriteStream(filePath));
  return true;
}

async function streamObject(key, res) {
  if (!enabled) {
    res.status(404).json({ error: "storage_not_configured" });
    return;
  }

  const normalized = normalizeKey(key);
  if (!normalized.startsWith("outputs/")) {
    res.status(403).json({ error: "forbidden_key" });
    return;
  }

  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: normalized }));
  if (response.ContentType) res.setHeader("Content-Type", response.ContentType);
  if (response.ContentLength) res.setHeader("Content-Length", String(response.ContentLength));
  res.setHeader("Cache-Control", "private, max-age=300");
  await pipeline(response.Body, res);
}

function publicUrl(key) {
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl}/${normalizeKey(key).split("/").map(encodeURIComponent).join("/")}`;
}

function appUrlForKey(key, mountPath) {
  const normalized = normalizeKey(key);
  const publicObjectUrl = publicUrl(normalized);
  if (publicObjectUrl) return publicObjectUrl;
  return `${mountPath("/api/storage")}?key=${encodeURIComponent(normalized)}`;
}

module.exports = {
  appUrlForKey,
  downloadFile,
  isEnabled,
  mode,
  putFile,
  streamObject
};
