// Global proof-hash ledger.
//
// ingestUploads() already dedupes files WITHIN a single submission. This ledger
// is the cross-submission memory: a SHA-1 we have ever accepted as proof cannot
// be re-used as proof for another quest/user. It is the cheapest, strongest
// anti-cheat signal we have — the verifier model can be fooled by a downloaded
// clip, but it can only be downloaded-and-reused once.
//
// Backed by a single JSON file. Best-effort and crash-safe (atomic rename);
// concurrent writers are serialized through an in-process promise chain, which
// is sufficient for the single-instance web server. For multi-instance
// deployments this should move to the same store as the rest of the data.

const fs = require("node:fs/promises");
const path = require("node:path");

let ledgerPath = null;
let cache = null; // Map<hash, { firstJobId, firstSeenAt }>
let writeChain = Promise.resolve();

function init(dataRoot) {
  ledgerPath = path.join(dataRoot, "proof-ledger.json");
  cache = null;
}

async function load() {
  if (cache) return cache;
  cache = new Map();
  if (!ledgerPath) return cache;
  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);
    for (const [hash, meta] of Object.entries(parsed.hashes || {})) {
      cache.set(hash, meta);
    }
  } catch {
    // no ledger yet — start empty
  }
  return cache;
}

async function persist() {
  if (!ledgerPath || !cache) return;
  const target = ledgerPath;
  const tmp = `${target}.${process.pid}.tmp`;
  const payload = { hashes: Object.fromEntries(cache), updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2));
  await fs.rename(tmp, target);
}

async function has(hash) {
  if (!hash) return false;
  const map = await load();
  return map.has(hash);
}

// Record a hash if new. Returns true if it was already present (i.e. reused).
async function record(hash, jobId) {
  if (!hash) return false;
  const map = await load();
  const existed = map.has(hash);
  if (!existed) {
    map.set(hash, { firstJobId: jobId || null, firstSeenAt: new Date().toISOString() });
    writeChain = writeChain.then(persist, persist);
    await writeChain;
  }
  return existed;
}

module.exports = { init, has, record };
