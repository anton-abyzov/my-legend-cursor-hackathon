# Legend — Proof Verifier

**Take a side. Live a legend. Prove it.** The universe deals you a real-world side quest, you go live it on camera, and a multimodal AI verifies your raw footage actually shows you doing it — then you share the verified proof. No editing: your footage, your story, with an AI-checked **verified** badge.

## How it started

Built at a Cursor hackathon. The spark: short-form "side quest" challenges are everywhere, but *proving* you actually did one is the hard part. The original prototype auto-edited clips into a reel and graded the edit; we pivoted to the thing that actually matters — **verification**. Now a narrative ritual (answer a few questions, let an omen pick your quest) leads straight into an adversarial AI check of your raw upload. The verifier runs on FFmpeg frame sampling + Google Gemini, with Supabase and Cloudflare R2 for the hosted path.

## What it does

The hosted web app (`src/web/public/legend/`) is a guided, sequential ritual. End to end:

1. **Answer the questions / get your quest.** A five-question "Trials" quiz (age, fears, what you love) feeds an "Omen" ritual — cast a die, draw a card, or take the signal. The ritual reveals one provable side quest (`pickQuest()` in `src/web/public/legend/leyend-data.jsx`, personalized by your answers).
2. **Complete it and upload raw proof.** Accept the quest, go do it, then drop your raw photo(s) or clip(s) on the **Proof of Legend** screen. The browser posts them to `POST /api/quests` (`src/web/server.js`), which hashes every file (SHA-1), skips duplicates, checks them against a global proof-hash ledger (no reusing footage), stores them (Cloudflare R2 or local disk), and kicks off an async verification job.
3. **AI verifies the proof.** `runJob()` calls `verifyQuest()` (`src/engine/questVerifier.js`) on the **raw upload** — no editing. It samples frames across the clip, asks Gemini an adversarial yes/no question ("does this genuinely show the claimed action?") **multiple times** for stability, and folds in provenance signals the model can't reason about (hash reuse, capture timestamp). The **Verdict** screen polls `GET /api/quests/:id` and shows live stages (Ingest → Verify).
4. **Verdict + share.** The verifier returns **PASS / FLAG / REJECT** with a confidence, the evidence it saw, and what (if anything) was missing. A PASS earns the verified badge and is shareable; a FLAG routes to human review; a REJECT explains why. The **Verdict** screen plays your raw proof with the verdict front and center, and a sealed PASS joins your constellation in the Journal.

The decision is a genuine AI judgment, not a fixed value: with a Gemini key the verifier samples frames from the upload and the model literally looks at them across several independent passes, gating PASS/REJECT on agreement + confidence. **Without a key, every proof is FLAGGED for manual review** — the badge is never auto-granted, because its whole value is being hard to fake.

### Two surfaces

- **`/` — the Legend showcase** (default). The cinematic, story-driven flow described above. Uses a curated set of narrative quests and the upload → verify → share pipeline. Landscape-aware: a desktop brand rail with constellation progress beside a framed "phone" stage; collapses to full-bleed mobile screens under 980px.
- **`/builder` — the Quest Builder** (admin/dev tool). The raw control panel: auth-gated APIs, the full **561-quest** catalog with smart recommendations, job history, and analytics. *(Note: the builder UI still reflects the old grade-centric layout and is pending a verifier-aware refresh — see "Known follow-ups".)*

## Features

- **Omen ritual quest selection** — dice / card / phone triggers that personalize the reveal from quiz answers and hide already-completed quests.
- **AI proof verification** — frames sampled from the **raw upload** + Google Gemini, adversarial yes/no with multi-pass agreement and confidence gating → PASS / FLAG / REJECT with evidence. The product, not a nice-to-have.
- **Anti-cheat provenance** — content-hash dedupe (SHA-1) within a submission, a **global proof-hash ledger** so the same file can't be reused as proof twice, and capture-timestamp checks that can only downgrade a PASS, never grant one.
- **Honest fallback** — no Gemini key → every proof is FLAGGED for manual review, never silently passed.
- **Live verify progress** — async jobs with staged progress (Ingest → Verify), ETA smoothing, and a streaming log.
- **561-quest catalog + recommender** — enriched with category, difficulty, XP, social/setting/cost, and tags; "For you", "Daily", and weighted "Roll random" picks, plus XP/leveling from verified completions.
- **Real auth** — Supabase email/password + Google SSO, HttpOnly cookie sessions with transparent refresh, password-gate and open-dev fallbacks.
- **Pluggable storage** — Cloudflare R2 (S3-compatible) for hosted media, served privately through `/api/storage`; local disk otherwise.
- **Verification analytics** — every verdict appended to `web-data/analytics/verifications.jsonl`; `GET /api/analytics` returns pass-rate and breakdowns.

## Known follow-ups

- **`/builder` admin UI** (`src/web/public/app.js`) still renders the old 0–10 grade card and render-era stages; it needs a verifier-aware pass.
- **Desktop shell** (`src/main.js`): the Electron edit/render handlers were removed (they throw a clear "moved to web" error). The desktop verify flow is not yet rebuilt; the web app is the product surface.
- **Supabase persistence** is optional — apply `supabase/migrations/0003_verification.sql` (additive, nullable columns) to make verdicts durable.

## Tech stack

- **Runtime:** Node.js 22+, [Express 5](https://expressjs.com/)
- **Media:** FFmpeg / FFprobe (system or `@ffmpeg-installer` / `@ffprobe-installer`) for frame sampling + provenance probing
- **Frontend (showcase):** React 18 + Babel standalone, hand-written CSS (`src/web/public/legend/`)
- **Auth + data model:** [Supabase](https://supabase.com/) (`@supabase/supabase-js`) — auth + `side_quests` / `quest_picks` / `quest_completions`
- **Object storage:** Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`
- **AI verification:** Google Gemini (`gemini-flash-latest`, multimodal) — adversarial multi-pass yes/no over sampled frames; flags for manual review when unconfigured
- **Uploads:** [Multer](https://github.com/expressjs/multer)
- **Desktop shell:** Electron 42 (`npm start`)
- **Tests:** [Playwright](https://playwright.dev/) E2E (`tests/auth.spec.js`)

## Getting started

```bash
npm install
```

### Web app (the showcase)

```bash
npm run web
```

- Showcase: <http://localhost:4317>
- Quest Builder (admin): <http://localhost:4317/builder>

Runs fully offline with no keys: open dev auth, local-disk storage, the committed `data/side-quests.json` catalog, and the deterministic heuristic grader.

### Desktop app

```bash
npm start          # Electron desktop MVP
```

### Requirements

- Node.js 22+
- FFmpeg and FFprobe on `PATH` (or rely on the bundled installer deps)
- HyperFrames is a project dependency; the engine falls back to `npx --yes hyperframes@0.6.70`

### Environment variables

Copy `.env.example` and fill in only what you need — every integration degrades gracefully if unset. Highlights:

| Variable | Purpose |
| --- | --- |
| `PORT` | Web server port (default `4317`) |
| `LEGEND_BASE_PATH` | Mount under a reverse-proxy subpath (e.g. `/legend`) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Enable Supabase auth (email/password + Google SSO) and catalog reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-owned catalog + completion writes; flips the store to `supabase` |
| `LEGEND_WEB_PASSWORD` | Legacy single-password gate (fallback when Supabase is off) |
| `LEGEND_STORAGE_PROVIDER=r2` + `CLOUDFLARE_R2_*` + `LEGEND_R2_BUCKET` | Cloudflare R2 video storage |
| `LEGEND_GEMINI_API_KEY` | Tier-1 multimodal grader (samples frames from the MP4) |
| `CLOUDFLARE_WORKERS_AI_TOKEN` (+ account id) | Tier-2 free metadata-only grader |

The active auth mode, storage mode, catalog source, and grader tier are all reported by `GET /healthz`.

### Seed Supabase (optional)

```bash
npm run build:quests     # rebuild data/side-quests.json from the raw list
npm run seed:supabase    # needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

### E2E tests

```bash
npx playwright install chromium   # first run only
npm run test:e2e
```

Covers Supabase email/password sign-in, session persistence, logout, bad-credential rejection, the Google SSO redirect, and the sign-up contract. Expects a pre-confirmed Supabase user (override with `E2E_EMAIL` / `E2E_PASSWORD`).

## Architecture overview

```
Browser (Legend showcase, React)            src/web/public/legend/
   │  quiz → omen → reveal → upload
   ▼
POST /api/quests  (Express, Multer)          src/web/server.js
   │  SHA-1 dedupe → store (R2 / disk) → write job → async runJob()
   ▼
createSideQuestProject()                     src/engine/sideQuestProject.js
   │  FFmpeg probe + silence detection + best-moment select
   │  → FFmpeg concat → HyperFrames project (DESIGN.md, index.html)
   │  → hyperframes lint → hyperframes render → final MP4
   ▼
gradeQuest()                                 src/engine/questGrader.js
   │  Gemini (frames) → Cloudflare (metadata) → heuristic
   ▼
Verdict screen polls GET /api/quests/:id  →  score /10 + sub-scores + rationale
   │
   └─ records quest_completions (Supabase or local) + grades.jsonl analytics
```

Key files:

- `src/web/server.js` — Express server, job lifecycle, auth, storage, all routes
- `src/engine/sideQuestProject.js` — the FFmpeg + HyperFrames render pipeline
- `src/engine/questGrader.js` — three-tier AI grader
- `src/web/public/legend/leyend-screens.jsx` — the showcase screens (upload / cooking / verify)
- `src/web/public/legend/leyend-data.jsx` — quiz + curated quests + `pickQuest()`
- `src/web/lib/questStore.js` — catalog access (Supabase ↔ local JSON), recommender, progress
- `src/web/lib/authStore.js` — Supabase auth (password + Google PKCE)
- `src/web/lib/objectStorage.js` — R2 / local storage abstraction
- `supabase/migrations/` — `side_quests`, `quest_picks`, `quest_completions`
- `data/side-quests.json` — committed 561-quest catalog (offline fallback)

Generated jobs and the local render cache live under `web-data/` (git-ignored).

## Demo

A full ~2-minute hackathon walkthrough script (cold open → product → team → live showcase → closer) is in [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md), written as on-screen ACTIONS + spoken VOICEOVER against the real UI.

## Team

- Anton Abyzov
- _(add teammates here)_
- _(add teammates here)_
