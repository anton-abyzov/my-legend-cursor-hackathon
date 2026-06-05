# Legend — HyperFrames

**Take a side. Live a legend.** The universe deals you a real-world side quest, you go live it on camera, and an AI editor turns your raw clips into a cinematic proof reel — then a multimodal AI watches the result and grades how close it landed to the brief, out of 10.

## How it started

Built at a Cursor hackathon. The spark: short-form "side quest" challenges are everywhere, but proving you actually did one is a chore — you shoot messy footage and it never gets edited. So we wired a narrative ritual (answer a few questions, let an omen pick your quest) directly into an automated edit-and-grade pipeline. You bring the raw clips; the app forges the proof and an AI judges it. The whole thing runs locally on FFmpeg + [HyperFrames](https://www.npmjs.com/package/hyperframes), with Supabase and Cloudflare R2 for the hosted path.

## What it does

The hosted web app (`src/web/public/legend/`) is a guided, sequential ritual. End to end:

1. **Answer the questions / get your quest.** A five-question "Trials" quiz (age, fears, what you love) feeds an "Omen" ritual — cast a die, draw a card, or take the signal. The ritual reveals one provable side quest (`pickQuest()` in `src/web/public/legend/leyend-data.jsx`, personalized by your answers).
2. **Upload your video.** Accept the quest, then drop one or many raw clips on the **Proof of Legend** screen. The browser posts them to `POST /api/quests` (`src/web/server.js`), which hashes every file (SHA-1), skips duplicates, stores them (Cloudflare R2 or local disk), and kicks off an async render job.
3. **The pieces get combined (render).** `runJob()` calls `createSideQuestProject()` (`src/engine/sideQuestProject.js`): FFmpeg probes each clip, detects silent spans and keeps the audible moments, pre-concats them into one stable track, generates a HyperFrames composition (`DESIGN.md` + `index.html` with GSAP captions and chrome), runs `hyperframes lint`, and renders the final MP4 with `hyperframes render`. The **Forge** screen polls `GET /api/quests/:id` and shows live stages (Ingest → Plan → Render → Judge) and a tail of the render log.
4. **AI verification + score.** Once the MP4 exists, `gradeQuest()` (`src/engine/questGrader.js`) scores it **0–10** against the original request, with four sub-scores (prompt match, visual quality, pacing, audience fit), a one-word verdict, and a written rationale. The **Verdict** screen plays the rendered video and shows the score front and center. Seal it and it joins your constellation in the Journal.

The number is a genuine AI judgment, not a fixed value: with a Gemini key the grader samples ~6 frames from the rendered MP4 and the model literally looks at them; otherwise it falls back to a free metadata-only model, then to a deterministic heuristic so a job is never left ungraded.

### Two surfaces

- **`/` — the Legend showcase** (default). The cinematic, story-driven flow described above. Uses a curated set of narrative quests and the same upload → render → grade pipeline. Landscape-aware: a desktop brand rail with constellation progress beside a framed "phone" stage; collapses to full-bleed mobile screens under 980px.
- **`/builder` — the Quest Builder** (admin/dev tool). The raw control panel: auth-gated APIs, the full **561-quest** catalog with smart recommendations, manual prompt/persona/format controls, job history, and grade analytics.

## Features

- **Omen ritual quest selection** — dice / card / phone triggers that personalize the reveal from quiz answers and hide already-completed quests.
- **Duplicate-skipping uploads** — content-hash dedupe (SHA-1) before anything is rendered; supports MP4, MOV, M4V, WebM, MKV, AVI (non-H.264 sources are normalized).
- **Automated HyperFrames edit** — silence detection, best-moment selection, captioned cinematic composition, lint, and draft render — no manual editing.
- **Live render progress** — async jobs with staged progress, ETA smoothing, and a streaming ritual log.
- **Multimodal AI grading** — three auto-selected tiers (Gemini frames → Cloudflare metadata → heuristic), 0–10 with sub-scores, verdict, rationale, and gaps.
- **561-quest catalog + recommender** — enriched with category, difficulty, XP, social/setting/cost, and tags; "For you", "Daily", and weighted "Roll random" picks, plus XP/leveling from graded completions.
- **Real auth** — Supabase email/password + Google SSO, HttpOnly cookie sessions with transparent refresh, password-gate and open-dev fallbacks.
- **Pluggable storage** — Cloudflare R2 (S3-compatible) for hosted media, served privately through `/api/storage`; local disk otherwise.
- **Grade analytics** — every grade appended to `web-data/analytics/grades.jsonl`; `GET /api/analytics` returns averages and breakdowns.

## Tech stack

- **Runtime:** Node.js 22+, [Express 5](https://expressjs.com/)
- **Media:** FFmpeg / FFprobe (system or `@ffmpeg-installer` / `@ffprobe-installer`), [HyperFrames `0.6.70`](https://www.npmjs.com/package/hyperframes) render engine
- **Frontend (showcase):** React 18 + Babel standalone, hand-written CSS (`src/web/public/legend/`)
- **Auth + data model:** [Supabase](https://supabase.com/) (`@supabase/supabase-js`) — auth + `side_quests` / `quest_picks` / `quest_completions`
- **Object storage:** Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`
- **AI grading:** Google Gemini (`gemini-flash-latest`, multimodal) → Cloudflare Workers AI (Llama, metadata) → deterministic heuristic
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
