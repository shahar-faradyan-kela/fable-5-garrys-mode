# Prompt for Shahar's Claude Code (Fable 5.1) — paste everything below the line

Setup first: wait for Daniel's "pushed" → `git clone https://github.com/shahar-faradyan-kela/fable-5-garrys-mode && cd fable-5-garrys-mode && claude` → `/model` = Fable 5.1 → paste.

---

You are building half of **DropIn** at a one-hour hackathon (Claude Code Fable 5.1 Build Day). Demo on stage at 20:00, two minutes, run live. Work fast, no questions unless truly blocked, no gold-plating.

**Read `PLAN.md` and `CONTRACT.md` now.** `CONTRACT.md` is the only seam between me and Daniel — do not change it without telling me to tell him.

**The product:** upload a video of a real place → processing stages → walk around inside it as a 3D Gaussian splat (WASD + mouse). Daniel builds the 3D world. I build the backend and the upload screen.

**Judging, 25 % each:** new model capability · it works live · you'd use or share it · demo clarity. My half carries the first two: **the Claude vision call is the "new capability" the judges came to see, and the stage screen is where they see it.** Make that moment land.

## I own — touch nothing else
`server/**` and `web/src/upload/**`

## Build in this order

**1. Server skeleton (first PR, merged by 19:40).** `server/`, FastAPI + uv, port 8000, CORS open to `http://localhost:5173`. In-memory job dict, one background task per job. No DB, queue, S3, WebSockets, Docker, auth, tests. One run command, written in `server/README.md`.

**2. `POST /api/jobs`** — multipart field `video` → save under `server/data/<jobId>/` → validate (reject > 3 min or < 1080p with a clear `400 {error}`; env `SKIP_VALIDATION=1` bypasses) → return `201 {jobId}` immediately.

**3. The stage machine, exactly per `CONTRACT.md`:** queued → extracting → poses → training → compressing → done. **Whole run ≤ 20 s.** `progress` climbs smoothly 0→1, never jumps backward.
- `extracting` is REAL: ffmpeg at 2 fps, capped at 12 frames spread across the video, JPEG, max 1280 px wide, served under `/files/`. Start `brew install ffmpeg` in the background right now; fallback is the `imageio-ffmpeg` pip package (bundled binary — read duration/resolution from `ffmpeg -i` stderr, there is no ffprobe in it).
- `poses`, `training`, `compressing` are STAGED: timed sleeps with ticking progress. Real COLMAP + splat training needs a CUDA GPU and ~30 min. Do not attempt it, do not install it.
- `done` → `splatUrl` = the pre-trained world. Mount the repo-root `assets/worlds/` at `/files/worlds/`; the file is `room.splat`; env var `DEMO_WORLD` overrides the filename. Return absolute URLs.

**4. The Claude call — the point of the evening.** The moment frames exist, send 5–6 of them (evenly spaced) to the Claude API, model **`claude-fable-5-1`**, vision, and get structured JSON back matching `scene` in `CONTRACT.md`: `title`, `tagline`, `narration` (2–3 sentences, second person, as if the player just landed there: what the place is, what to walk toward), `landmarks` (3–5 concrete things actually visible in the frames). Run it concurrently with the staged steps. 15 s timeout; on any failure `scene` stays null and the job still finishes. **Load the `claude-api` skill before writing this call.** Key: `server/.env` → `ANTHROPIC_API_KEY`, gitignored, never committed, never logged.

**5. `web/src/upload/UploadFlow.tsx`** — the scaffold is already on `main` (Vite + React + TS, `npm install && npm run dev` in `web/`). Replace the stub; keep the default export name. Types, `API`, `getJob` and `playUrl` come from `web/src/contract.ts` — import, never redefine.
- Screen 1: the name, one line ("Film a place. Walk into it."), one big drop zone. Show the server's validation error in plain words.
- Screen 2: the five stages as a vertical track with the live one highlighted, one overall progress bar, the extracted frames appearing as a strip, and — when `scene` arrives — **Claude's title and tagline revealed prominently with a small "seen by Claude Fable 5.1" label.** That reveal is the capability moment; give it room.
- On `done`: a large **Drop in** button → `window.location.href = playUrl(jobId)`.
- Readable from the back of a room: big type, high contrast, no clutter, no router library, no UI kit.

## Git
Branch `shahar/<thing>` off `main` → PR → merge it yourself at once, no review. `git pull` before every new branch. We never share a folder, so conflicts should not happen; if one does, stop and tell me.

## Clock
19:40 server PR merged (tell Daniel the run command) · 19:48 full flow works on `main` · **19:52 freeze — fixes only** · then Phase 2 arrives from Daniel.

## Done means
A real video dropped at `localhost:5173` walks all stages in ≤ 20 s, shows its frames and Claude's title, and the Drop in button lands in Daniel's world with the same `jobId`. Test it with a real video before you say done, and tell me exactly what you ran.
