#!/usr/bin/env node
/**
 * Seed the Supabase `side_quests` table from data/side-quests.json.
 *
 * Requires (env or .env):
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   (server-only secret)
 *
 * Run the migration first (supabase/migrations/0001_side_quests.sql), then:
 *   node scripts/seedSupabase.js
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function loadDotEnv(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at <= 0) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadDotEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Aborting seed.");
    process.exit(1);
  }

  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "side-quests.json"), "utf8"));
  const rows = data.quests.map((q) => ({
    slug: q.slug,
    title: q.title,
    description: q.description,
    category: q.category,
    difficulty: q.difficulty,
    base_xp: q.base_xp,
    bonus_xp: q.bonus_xp,
    total_xp: q.total_xp,
    social: q.social,
    setting: q.setting,
    cost: q.cost,
    tags: q.tags,
    source: q.source,
    source_number: q.source_number,
    is_active: true
  }));

  const batchSize = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("side_quests").upsert(batch, { onConflict: "slug" });
    if (error) {
      console.error(`Batch ${i / batchSize + 1} failed:`, error.message);
      process.exit(1);
    }
    upserted += batch.length;
    console.log(`Upserted ${upserted}/${rows.length}`);
  }

  console.log(`Done. Seeded ${upserted} side quests into Supabase.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
