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
- Uploads accept MP4, MOV, M4V, WebM, MKV, and AVI. QuickTime `.mov` files with H.264/HEVC are used as-is; other codecs are auto-transcoded to MP4 before editing.
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
