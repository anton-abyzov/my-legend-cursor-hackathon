#!/usr/bin/env node
/**
 * Parse, clean, dedupe and enrich the raw side-quest list into a structured
 * catalog. The raw file is a numbered list scraped from a community site, so it
 * carries duplicates, gibberish, multi-line "bonus XP" notes and a few unsafe
 * entries. This turns it into the database of record for the app.
 *
 *   node scripts/buildSideQuests.js
 *
 * Output: data/side-quests.json  (committed; the local source of truth/fallback)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "sources", "side-quests-raw.txt");
const OUT = path.join(ROOT, "data", "side-quests.json");

// Raw entry numbers that are gibberish, hateful, dangerous, or sexual coercion.
// These are dropped outright rather than enriched.
const BLOCKED_NUMBERS = new Set([
  199, // political "threat" joke
  213, // "go to Dagestan for 5 years" / unrealistic noise
  214, // sexual coercion against someone's partner
  271, // get minors high at school
  326 // "howhkhkhkh" keyboard mash
]);

const UNSAFE_CONTENT = [
  /\b(blackout drunk|drugs?|get high|smoking|steal|stealing|sneak out)\b/i,
  /\b(weapon|weapons|dagger|longsword|saber|turret|projectile)\b/i,
  /\b(fight|fighting|hurt|injur|death|die|dies|suicide)\b/i,
  /\b(roof|rooftop|jump from window|train tracks|under a bridge)\b/i,
  /\b(stranger'?s house|phone number|instagram)\b/i,
  /\b(tattoo|tattoos|get married|propose)\b/i,
  /\b(hitchhiking|no calling for a rescue pickup|tip .*drivers .*race)\b/i,
  /\b(burn 2,?500 calories|force them|without consent)\b/i
];

function readRaw() {
  return fs.readFileSync(RAW, "utf8").split(/\r?\n/);
}

/**
 * Group physical lines into logical entries. An entry starts at `N. ...` and
 * absorbs every following non-numbered line (bonus XP notes, tips, etc.).
 */
function groupEntries(lines) {
  const entries = [];
  let current = null;

  for (const line of lines) {
    const match = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (match) {
      if (current) entries.push(current);
      current = { number: Number(match[1]), lines: [match[2]] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitTitleDescription(text) {
  // Titles are separated from the body by an em dash (— / – / --) or a hyphen.
  const sep = text.search(/\s+[—–]\s+|\s+--\s+/);
  if (sep === -1) {
    const dash = text.search(/\s+-\s+/);
    if (dash === -1) return { title: text, description: "" };
    return { title: text.slice(0, dash), description: text.slice(dash).replace(/^\s+-\s+/, "") };
  }
  return {
    title: text.slice(0, sep),
    description: text.slice(sep).replace(/^\s+[—–-]+\s+/, "").replace(/^--\s+/, "")
  };
}

function isGibberish(value) {
  const v = value.toLowerCase();
  if (!v) return true;
  // single long token with no vowels / repeated chars = keyboard mash
  if (!/\s/.test(v) && v.length > 12 && !/[aeiou]/.test(v)) return true;
  if (/(.)\1{6,}/.test(v)) return true;
  return false;
}

function isUnsafe(value) {
  return UNSAFE_CONTENT.some((rule) => rule.test(value));
}

// --- enrichment ----------------------------------------------------------

const CATEGORY_RULES = [
  ["fitness", /push-?up|pull-?up|plank|run|marathon|triathlon|ironman|gym|workout|lift|squat|sit-?up|5k|mile|calisthen|muscle-?up|handstand|backflip/i],
  ["adventure", /climb|mountain|hike|camp|abandoned|explore|skydiv|bungee|paraglid|sail|raft|wilderness|cave|urban explor/i],
  ["travel", /flight|fly to|country|abroad|greece|trip|road ?trip|tourist|bus|train|subway|tram|airport/i],
  ["social", /stranger|friend|people|hug|compliment|conversation|introduce|talk to|meet|club|party|date|crush|rizz|high-?five/i],
  ["creative", /draw|paint|sketch|art|origami|doodle|lego|build|craft|sculpt|design|poem|zine|tattoo|crochet|embroid/i],
  ["music", /song|guitar|instrument|album|playlist|band|sing|cover|dance|salsa|dj|musical/i],
  ["food", /cook|bake|cake|waffle|pizza|grill|sourdough|cupcake|meal|egg|drink|coffee|kombucha|recipe|chef/i],
  ["mindfulness", /meditat|walk|grass|nature|sunset|sunrise|stargaz|journal|gratitude|detox|no phone|screen time|breathe|present moment/i],
  ["learning", /learn|study|read a book|language|rubik|chess|magic trick|skill|interview|essay|homework|course|license/i],
  ["animals", /\b(dogs?|cats?|birds?|crows?|chickens?|fish|crabs?|animals?|pets?|kittens?|puppy|puppies|shelter|farm)\b/i],
  ["comedy", /pretend|prank|gaslight|costume|cosplay|accent|fake|reality show|npc|conspiracy|lie|gibberish/i],
  ["service", /donate|volunteer|homeless|kindness|help|food bank|plant a tree|crosswalk/i]
];

function classifyCategory(text) {
  for (const [name, rule] of CATEGORY_RULES) {
    if (rule.test(text)) return name;
  }
  return "misc";
}

const EXTREME = /marathon|ironman|triathlon|skydiv|bungee|paraglid|black belt|world record|world champion|netherite|ender dragon|scuba|open water|boating license|motorcycle (license|course)|muscle-?up|sub ?20|5 years|3× your body|lift 3|monetiz|100 followers|get married|propose|50-?mile|100 (push-?ups|pull-?ups)|fight a bear|kung fu|trebuchet|build a tank|get a tattoo|^tattoo|fluent|conversationally fluent|new language|aqquire a j|acquire a job|get a job|2,?000 pieces|burn 2,?500|2,500 cal/i;
const HARD = /half marathon|learn (a |how |to )|certification|license|for a month|for 1 ?week|for a week|all-?nighter|all night|overnight|24 ?hours|two days|2 days|build (a|your|something)|climb a mountain|multi-?pitch|500 pages|300 pages|start a (business|band|collection|dog-?walking)|quit (smoking|an addiction)|record (a|an album|a cover)|short film|stop-?motion|sourdough|raft|fort|time capsule|treasure|backflip|handstand|crochet|lock pick|unicycle|stick|manual car|black belt|100 (sketches|things)|350 push|read a book|finish a book|tame|befriend|board game.*strangers|geocach|escape room/i;
const EASY = /drink (a glass|water|any|every)|touch grass|hug (a|your|me|someone)|compliment|stay hydrated|easy xp|just click|count to 100|stare at a wall|do nothing|take a shower|10-?minute walk|go for a walk|^pet |pet (a|that|6|the)|say hello|smile|chug|plank for 1|do 10 push|20 push|hydrate|just go|touch some grass|clean (your room|up your room|my room)|boop|high-?five|stretch|nap|wave/i;

function classifyDifficulty(text) {
  if (EXTREME.test(text)) return "extreme";
  if (HARD.test(text)) return "hard";
  if (EASY.test(text)) return "easy";
  return "medium";
}

const DIFFICULTY_BASE_XP = { easy: 100, medium: 300, hard: 700, extreme: 1500 };

function extractBonusXp(text) {
  const matches = [...text.matchAll(/([\d.,]+)\s*(?:bonus\s*)?xp/gi)];
  return matches.map((m) => Number(m[1].replace(/[.,]/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
}

function classifySocial(text) {
  if (/\bfriends\b|\bgroup\b|\bteam\b|\bbuddies\b|each other|together with|with (your|a) friend|strangers/i.test(text)) {
    return /alone|by yourself|solo|yourself/i.test(text) ? "either" : "group";
  }
  if (/alone|by yourself|solo|yourself|a stranger/i.test(text)) return "solo";
  return "either";
}

function classifySetting(text) {
  if (/outside|outdoor|park|mountain|hike|street|beach|forest|nature|field|trail|city|walk|wilderness|sky/i.test(text)) return "outdoor";
  if (/at home|your room|kitchen|indoor|bathroom|gym|studio|store|restaurant|cafe|library/i.test(text)) return "indoor";
  return "anywhere";
}

function classifyCost(text) {
  if (/\bfree\b|no money|cheapest/i.test(text)) return "free";
  if (/fly|flight|abroad|tattoo|license|certification|skydiv|bungee|gym membership|buy a (skateboard|kite|book|guitar|lego)|class|course|scuba|ironman/i.test(text)) return "paid";
  if (/buy|order|purchase|pay|ticket|rent|thrift|grocer/i.test(text)) return "cheap";
  return "free";
}

const STOP = new Set(["with", "your", "that", "this", "from", "into", "have", "they", "them", "then", "just", "only", "make", "take", "must", "will", "want", "some", "what", "when", "where", "their", "about", "until", "going", "after", "before", "while", "every", "find", "good", "luck", "back", "down", "over", "more", "than", "even"]);

function tags(text) {
  const seen = new Set();
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word.length >= 4 && !STOP.has(word)) seen.add(word);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "side-quest";
}

function build() {
  const entries = groupEntries(readRaw());
  const quests = [];
  const seen = new Map();
  let dropped = 0;

  for (const entry of entries) {
    if (BLOCKED_NUMBERS.has(entry.number)) {
      dropped += 1;
      continue;
    }

    const body = entry.lines.map(normalizeWhitespace).filter(Boolean).join(" ");
    if (!body) continue;

    let { title, description } = splitTitleDescription(body);
    title = normalizeWhitespace(title);
    description = normalizeWhitespace(description) || title;

    if (isGibberish(title) || isGibberish(description)) {
      dropped += 1;
      continue;
    }
    if (title.length < 2) continue;

    const dedupeKey = `${title.toLowerCase()}::${description.toLowerCase()}`.slice(0, 160);
    if (seen.has(dedupeKey)) continue;

    const full = `${title} ${description}`;
    if (isUnsafe(full)) {
      dropped += 1;
      continue;
    }

    const difficulty = classifyDifficulty(full);
    const bonuses = extractBonusXp(full);
    const baseXp = DIFFICULTY_BASE_XP[difficulty];
    const bonusXp = bonuses.length ? Math.max(...bonuses) : 0;

    const quest = {
      slug: slugify(title),
      title,
      description,
      category: classifyCategory(full),
      difficulty,
      base_xp: baseXp,
      bonus_xp: bonusXp,
      total_xp: baseXp + bonusXp,
      social: classifySocial(full),
      setting: classifySetting(full),
      cost: classifyCost(full),
      tags: tags(full),
      source: "community-sidequests",
      source_number: entry.number
    };

    seen.set(dedupeKey, quest);
    quests.push(quest);
  }

  // unique slugs
  const slugCount = new Map();
  for (const quest of quests) {
    const n = (slugCount.get(quest.slug) || 0) + 1;
    slugCount.set(quest.slug, n);
    if (n > 1) quest.slug = `${quest.slug}-${n}`;
  }

  const byCategory = {};
  const byDifficulty = {};
  for (const q of quests) {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    count: quests.length,
    dropped,
    byCategory,
    byDifficulty,
    quests
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`Wrote ${quests.length} quests (dropped ${dropped}) -> ${path.relative(ROOT, OUT)}`);
  console.log("By difficulty:", byDifficulty);
  console.log("By category:", byCategory);
}

build();
