/**
 * Side-quest catalog access.
 *
 * Source of truth is Supabase (`side_quests` table) when SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY are configured. Otherwise it
 * falls back to the committed data/side-quests.json so the app works offline.
 */
const fs = require("node:fs");
const path = require("node:path");

const JSON_PATH = path.resolve(__dirname, "..", "..", "..", "data", "side-quests.json");

let cache = null;
let supabase = null;
let supabaseFailed = false;

function loadLocal() {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    cache = Array.isArray(data.quests) ? data.quests : [];
  } catch {
    cache = [];
  }
  return cache;
}

function supabaseClient() {
  if (supabaseFailed) return null;
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    supabaseFailed = true;
    return null;
  }
  try {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(url, key, { auth: { persistSession: false } });
    return supabase;
  } catch {
    supabaseFailed = true;
    return null;
  }
}

function mode() {
  return supabaseClient() ? "supabase" : "local-json";
}

const ALLOWED = {
  difficulty: new Set(["easy", "medium", "hard", "extreme"]),
  cost: new Set(["free", "cheap", "paid"]),
  social: new Set(["solo", "group", "either"]),
  setting: new Set(["indoor", "outdoor", "anywhere"])
};

function normalizeFilters(filters = {}) {
  const clean = {};
  for (const key of ["difficulty", "cost", "social", "setting"]) {
    const value = String(filters[key] || "").toLowerCase();
    if (ALLOWED[key].has(value)) clean[key] = value;
  }
  if (filters.category && String(filters.category).toLowerCase() !== "all") {
    clean.category = String(filters.category).toLowerCase().slice(0, 40);
  }
  if (filters.search) clean.search = String(filters.search).toLowerCase().slice(0, 80);
  return clean;
}

function applyLocalFilters(quests, filters) {
  return quests.filter((q) => {
    if (filters.difficulty && q.difficulty !== filters.difficulty) return false;
    if (filters.cost && q.cost !== filters.cost) return false;
    if (filters.category && q.category !== filters.category) return false;
    if (filters.social && filters.social !== "either" && q.social !== filters.social && q.social !== "either") return false;
    if (filters.setting && filters.setting !== "anywhere" && q.setting !== filters.setting && q.setting !== "anywhere") return false;
    if (filters.search) {
      const haystack = `${q.title} ${q.description} ${(q.tags || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });
}

async function list(rawFilters = {}, { limit = 60, offset = 0 } = {}) {
  const filters = normalizeFilters(rawFilters);
  const client = supabaseClient();

  if (client) {
    try {
      let query = client.from("side_quests").select("*", { count: "exact" }).eq("is_active", true);
      if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
      if (filters.cost) query = query.eq("cost", filters.cost);
      if (filters.category) query = query.eq("category", filters.category);
      if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      query = query.order("total_xp", { ascending: false }).range(offset, offset + limit - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return { quests: data || [], total: count ?? (data || []).length, source: "supabase" };
    } catch {
      // fall through to local
    }
  }

  let quests = applyLocalFilters(loadLocal(), filters);
  quests = quests.slice().sort((a, b) => b.total_xp - a.total_xp);
  const total = quests.length;
  return { quests: quests.slice(offset, offset + limit), total, source: "local-json" };
}

async function random(rawFilters = {}) {
  const filters = normalizeFilters(rawFilters);
  const client = supabaseClient();

  if (client) {
    try {
      // Pull a filtered slice and pick locally (cheap; catalog is small).
      let query = client.from("side_quests").select("*").eq("is_active", true).limit(400);
      if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
      if (filters.cost) query = query.eq("cost", filters.cost);
      if (filters.category) query = query.eq("category", filters.category);
      const { data, error } = await query;
      if (error) throw error;
      const pool = data || [];
      if (pool.length) return { quest: pool[Math.floor(Math.random() * pool.length)], source: "supabase" };
    } catch {
      // fall through
    }
  }

  const pool = applyLocalFilters(loadLocal(), filters);
  if (!pool.length) return { quest: null, source: "local-json" };
  return { quest: pool[Math.floor(Math.random() * pool.length)], source: "local-json" };
}

function facets() {
  const quests = loadLocal();
  const categories = {};
  for (const q of quests) categories[q.category] = (categories[q.category] || 0) + 1;
  return {
    total: quests.length,
    categories: Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    difficulties: ["easy", "medium", "hard", "extreme"],
    costs: ["free", "cheap", "paid"],
    socials: ["solo", "group", "either"],
    settings: ["indoor", "outdoor", "anywhere"]
  };
}

async function recordPick(slug, surface = "web") {
  const client = supabaseClient();
  if (!client || !slug) return;
  try {
    await client.from("quest_picks").insert({ quest_slug: slug, surface });
  } catch {
    // best-effort analytics; ignore failures
  }
}

// ── smart selection ─────────────────────────────────────────────

const DIFF_RANK = { easy: 1, medium: 2, hard: 3, extreme: 4 };
const XP_PER_LEVEL = 2000;
let poolCache = null;

/** Full active catalog (Supabase when configured, else local JSON). Cached. */
async function fetchPool() {
  const client = supabaseClient();
  if (client) {
    try {
      const { data, error } = await client.from("side_quests").select("*").eq("is_active", true).limit(2000);
      if (error) throw error;
      if (data && data.length) return data;
    } catch {
      // fall through to local
    }
  }
  if (!poolCache) poolCache = loadLocal();
  return poolCache;
}

function levelForXp(xp) {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

async function recordCompletion({ slug, jobId, gradeScore, xpEarned, surface = "web" } = {}) {
  const client = supabaseClient();
  if (!client || !slug) return;
  try {
    await client.from("quest_completions").insert({
      quest_slug: slug,
      job_id: jobId || null,
      grade_score: gradeScore == null ? null : Number(gradeScore),
      xp_earned: Math.max(0, Number(xpEarned) || 0),
      surface: surface === "desktop" ? "desktop" : "web"
    });
  } catch {
    // best-effort; ignore
  }
}

const EMPTY_PROGRESS = () => ({
  earnedXp: 0,
  level: 1,
  completedSlugs: [],
  bestGradeBySlug: {},
  countByCategory: {},
  countByDifficulty: {},
  avgGradeByCategory: {},
  recentCategory: null,
  source: "local-json"
});

async function getProgress() {
  const client = supabaseClient();
  if (!client) return EMPTY_PROGRESS();

  try {
    const { data, error } = await client
      .from("quest_completions")
      .select("quest_slug, grade_score, xp_earned, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const rows = data || [];
    const pool = await fetchPool();
    const bySlug = new Map(pool.map((q) => [q.slug, q]));

    const progress = EMPTY_PROGRESS();
    progress.source = "supabase";
    const completed = new Set();
    const gradeSumByCategory = {};
    const gradeCountByCategory = {};

    rows.forEach((row, index) => {
      progress.earnedXp += Math.max(0, Number(row.xp_earned) || 0);
      completed.add(row.quest_slug);
      const grade = row.grade_score == null ? null : Number(row.grade_score);
      if (grade != null) {
        const prev = progress.bestGradeBySlug[row.quest_slug];
        if (prev == null || grade > prev) progress.bestGradeBySlug[row.quest_slug] = grade;
      }
      const quest = bySlug.get(row.quest_slug);
      if (quest) {
        progress.countByCategory[quest.category] = (progress.countByCategory[quest.category] || 0) + 1;
        progress.countByDifficulty[quest.difficulty] = (progress.countByDifficulty[quest.difficulty] || 0) + 1;
        if (grade != null) {
          gradeSumByCategory[quest.category] = (gradeSumByCategory[quest.category] || 0) + grade;
          gradeCountByCategory[quest.category] = (gradeCountByCategory[quest.category] || 0) + 1;
        }
        if (index === 0) progress.recentCategory = quest.category;
      }
    });

    for (const cat of Object.keys(gradeSumByCategory)) {
      progress.avgGradeByCategory[cat] = gradeSumByCategory[cat] / gradeCountByCategory[cat];
    }
    progress.completedSlugs = [...completed];
    progress.level = levelForXp(progress.earnedXp);
    return progress;
  } catch {
    return EMPTY_PROGRESS();
  }
}

async function pickCounts() {
  const client = supabaseClient();
  if (!client) return {};
  try {
    const { data, error } = await client.from("quest_picks").select("quest_slug").limit(10000);
    if (error) throw error;
    const counts = {};
    for (const row of data || []) counts[row.quest_slug] = (counts[row.quest_slug] || 0) + 1;
    return counts;
  } catch {
    return {};
  }
}

function scoreQuest(quest, ctx) {
  const { progress, picks, unlocked } = ctx;
  let score = 0;
  const rank = DIFF_RANK[quest.difficulty] || 2;

  // tier bias: reward the tier matching the player's level, allow lower tiers,
  // softly penalize locked (above level) tiers.
  if (rank === unlocked) score += 3;
  else if (rank < unlocked) score += 1;
  else score -= 2 * (rank - unlocked);

  // category affinity: upweight categories the player grades well in.
  const avg = progress.avgGradeByCategory[quest.category];
  if (avg != null) score += ((avg - 5) / 5) * 2;

  // variety: downrank the most-recently completed category.
  if (progress.recentCategory && quest.category === progress.recentCategory) score -= 1.5;

  // novelty: nudge under-attempted quests.
  const pc = picks[quest.slug] || 0;
  score += 0.6 / (1 + pc);

  // free quests are easier to action; tiny nudge.
  if (quest.cost === "free") score += 0.2;

  return score;
}

function applyFilters(quests, filters) {
  return applyLocalFilters(quests, normalizeFilters(filters));
}

async function recommend(rawFilters = {}, { limit = 60 } = {}) {
  const [pool, progress, picks] = await Promise.all([fetchPool(), getProgress(), pickCounts()]);
  const completed = new Set(progress.completedSlugs);
  const unlocked = Math.min(4, progress.level);
  const ctx = { progress, picks, unlocked };

  const candidates = applyFilters(pool, rawFilters).filter((q) => !completed.has(q.slug));
  const ranked = candidates
    .map((quest) => ({ quest, score: scoreQuest(quest, ctx) }))
    .sort((a, b) => (b.score - a.score) || a.quest.slug.localeCompare(b.quest.slug))
    .slice(0, limit)
    .map((entry) => entry.quest);

  return { quests: ranked, total: candidates.length, source: progress.source };
}

async function smartRandom(rawFilters = {}, { mode: rollMode = "smart" } = {}) {
  if (rollMode === "uniform") return random(rawFilters);

  const { quests } = await recommend(rawFilters, { limit: 40 });
  if (!quests.length) return random(rawFilters);

  // weighted roll: higher-ranked candidates are more likely.
  const weights = quests.map((_, i) => quests.length - i);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < quests.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return { quest: quests[i], source: "smart" };
  }
  return { quest: quests[0], source: "smart" };
}

function dateSeed(dateStr) {
  const str = dateStr || new Date().toISOString().slice(0, 10);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function dailyQuest(rawFilters = {}, dateStr) {
  const pool = await fetchPool();
  const candidates = applyFilters(pool, rawFilters)
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug));
  if (!candidates.length) return { quest: null, source: "daily" };
  const seed = dateSeed(dateStr);
  return { quest: candidates[seed % candidates.length], source: "daily", date: dateStr || new Date().toISOString().slice(0, 10) };
}

module.exports = {
  list,
  random,
  facets,
  recordPick,
  recordCompletion,
  getProgress,
  recommend,
  smartRandom,
  dailyQuest,
  mode
};
