# Legend HyperFrames Desktop MVP

Local macOS desktop app for selecting videos, describing the edit, generating a HyperFrames composition, and rendering a draft MP4.

The repo also includes the first hosted web iteration: a question flow, authenticated upload endpoint, duplicate-file skipping, async server render jobs, quest history, and final MP4 verification.

## Run

```bash
npm install
npm start
```

## Run Web App

```bash
npm install
npm run web
```

Open `http://localhost:4317`.

Optional hard-coded auth:

```bash
LEGEND_WEB_PASSWORD=demo npm run web
```

For a reverse proxy subpath:

```bash
LEGEND_BASE_PATH=/legend npm run web
```

## Requirements

- Node.js 22+
- FFmpeg and FFprobe on `PATH` (or bundled via `@ffmpeg-installer/ffmpeg` / `@ffprobe-installer/ffprobe`)
- Uploads accept MP4, MOV, M4V, WebM, MKV, and AVI. Browser-safe H.264 MP4s are used directly; MOV/HEVC/10-bit/other codecs are normalized to H.264 MP4 before editing.
- HyperFrames is installed as a project dependency; the engine falls back to `npx --yes hyperframes@0.6.70`.

## Core Flow

1. Pick video files.
2. Write the detailed editing prompt and audience profile.
3. Generate a HyperFrames project.
4. Render a draft MP4.

The engine probes duration/resolution, detects silent spans with FFmpeg, selects audible segments, writes `DESIGN.md`, builds `index.html`, runs `hyperframes lint`, and renders with `hyperframes render`.

Optional AI planning is enabled only when both `OPENAI_API_KEY` and `OPENAI_MODEL` are present. Without them, the app uses a deterministic local planner.

## Web Flow

1. Answer the persona, side quest, format, and pacing questions.
2. The browser formulates the edit prompt.
3. Upload videos; the server hashes files and skips duplicates.
4. The server creates an async render job.
5. FFmpeg pre-concats the selected audible moments.
6. HyperFrames renders the final chrome and captions.
7. The verification panel shows output status, duration, resolution, selected clip count, duplicate count, and the MP4 link.

Generated jobs and local render cache live under `web-data/` by default and are ignored by git.

## Side Quest Database

Both the web and desktop flows now **start** by picking a real side quest from a
catalog of **561 cleaned, enriched quests** ("questions"). The render + grade at
the end is the "answer" — and completions link back to the quest they prove.

### Catalog (the questions)

- Source: a scraped community list (`sources/side-quests-raw.txt`).
- `npm run build:quests` parses it (`scripts/buildSideQuests.js`): groups
  multi-line entries, splits title/description, drops gibberish/unsafe/dupes,
  and **enriches** each quest with `category`, `difficulty` (easy/medium/hard/
  extreme), `base_xp` + parsed `bonus_xp` → `total_xp`, `social`, `setting`,
  `cost` (free/cheap/paid), and `tags`. Output: `data/side-quests.json`.
- `data/side-quests.json` is committed and is the **local-json fallback** so the
  app works with no external services.

### Storage / data model (Supabase)

`supabase/migrations/0001_side_quests.sql` defines:

- `side_quests` — the catalog (public anon read, RLS on).
- `quest_picks` — every selection (analytics + recommender novelty signal).
- `quest_completions` — the **answers**: `quest_slug` → `job_id` (proof video) +
  `grade_score` + `xp_earned` + `surface`. Server-owned through the service role.

Seed Supabase from the JSON with `npm run seed:supabase` (needs `SUPABASE_URL`
+ `SUPABASE_SERVICE_ROLE_KEY`). At runtime, set `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` and the store flips from `local-json` to `supabase`
(reported by `GET /healthz`). `SUPABASE_ANON_KEY` is only a read-only catalog
fallback. `src/web/lib/questStore.js` is the single access layer with graceful
fallback for both web and desktop (Electron main IPC).

### Smart selection

- **For you** (`GET /api/side-quests/recommended`) — hides completed quests,
  biases toward the tier matching your level (L1 easy → L2 medium → L3 hard →
  L4+ extreme; lower tiers still allowed), upweights categories you grade well
  in, downranks your most-recent category, and adds a novelty nudge for
  under-attempted quests. Deterministic tie-break by slug.
- **Daily** (`GET /api/side-quests/daily`) — deterministic pick seeded by the
  `YYYY-MM-DD` date (stable for the whole day, honors active filters).
- **Roll random** (`GET /api/side-quests/random`) — weighted roll over the
  recommended pool (top candidates more likely). `?mode=uniform` for a flat roll.
- **Progress / leveling** (`GET /api/progress`) — aggregates `quest_completions`
  into `earnedXp`, `level = 1 + floor(earnedXp / 2000)`, `completedSlugs`,
  `bestGradeBySlug`, and per-category/difficulty counts. The picker header shows
  Level · XP · completed, cards show a **Done** badge + **best grade** pill, and
  quests above your level get a subtle `Lvl N` lock chip (still selectable).

### Completion linkage

When a render is graded, `runJob()` writes a `quest_completions` row tying the
picked quest to the proof video (`job_id`) and its grade — so the same quest's
grades feed your XP, level, and the recommender over time.

Browse the catalog without Supabase:

```bash
npm run build:quests        # rebuild data/side-quests.json from the raw list
curl localhost:4317/api/side-quests/recommended | jq '.quests[0]'
```

## Storage Choice

Use Cloudflare R2 for video blobs. Supabase is a better fit later for auth, users, quest metadata, billing/subscriptions, and Google sign-in.

R2 is the default for hosted media because video previews and downloads burn bandwidth. Cloudflare R2 has free Internet egress, cheaper storage, very large object limits, and S3-compatible upload/download. Supabase Storage is useful, but its free tier has a 50 MB file limit and bandwidth/egress is a plan constraint.

Set these env vars to enable R2:

```bash
LEGEND_STORAGE_PROVIDER=r2
LEGEND_R2_BUCKET=legend-sidequests
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
```

When R2 is configured, raw uploads are written to `uploads/<jobId>/...` and final artifacts to `outputs/<jobId>/...`. The app serves private output objects through `/api/storage?key=...`, so the bucket does not need public access.

## Quest Grader

After each render, the app grades how well the output video matches the request and returns a 0-10 score with sub-scores (prompt match, visual quality, pacing, audience fit), a verdict, and a rationale. The grade is shown in the verification panel and stored in the job record.

Three tiers, auto-selected at startup (logged as `Quest grader level:`):

1. **Gemini (multimodal, preferred)** — set `LEGEND_GEMINI_API_KEY`. FFmpeg samples ~6 frames from the rendered MP4 and Gemini actually looks at them against the prompt. Default model `gemini-flash-latest`.
2. **Cloudflare Workers AI (free, metadata-only)** — set `CLOUDFLARE_WORKERS_AI_TOKEN` (+ account id, which falls back to the R2 account id). Grades plan-vs-request and pacing from metadata using a free Llama model. No frames.
3. **Heuristic (no keys)** — deterministic duration/keyword/clip-count scoring so a job is never left ungraded.

Analytics: every grade is appended to `web-data/analytics/grades.jsonl`. `GET /api/analytics` returns the average score, per-dimension breakdown, verdict distribution, and averages by provider/persona/side-quest. The active grader tier is reported by `GET /healthz`.
