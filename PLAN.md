# DropIn — the one-hour plan

**Pitch:** film a real place, walk around inside it a minute later. Track: **Breakthrough**.
**Clock:** build 19:00–20:00 · demo two minutes · repo `shahar-faradyan-kela/fable-5-garrys-mode`.

## How each judging criterion is won (25 % each)

| Criterion | What wins it |
|---|---|
| New capability | Fable 5.1 does two jobs on stage: (1) it **looks at the video frames and writes the place** — title, narration, landmarks — shown in the world's HUD; (2) it **built the whole app** — two Claude Code sessions, in parallel, off one contract file, in one hour. Say both out loud. Before the demo, read the Fable 5.1 launch notes and name the exact new capability we lean on — never claim one we did not check. |
| It works | One flow, run live, rehearsed twice, with a recorded backup. Nothing on screen that is not wired. |
| Keep or share | Anyone with a phone video gets a walkable place: an apartment viewing, a venue, a memory. |
| Clarity | The demo script below. One sentence per beat. |

## The two-minute demo

1. (10 s) "This is a phone video of a room. We are going to walk into it."
2. (25 s) Drop the video → stages run live: frames appear, then **Claude names the place** on screen.
3. (15 s) "Reconstruction — camera poses and splat training — takes 30 minutes on a GPU, so tonight that stage loads a pre-trained world. Everything else you see is live." Honest, one breath.
4. (50 s) **Drop in.** Fall into the room, WASD + mouse, walk to a landmark Claude listed, hit the wall and stop.
5. (20 s) "Two developers, two Claude Code sessions on Fable 5.1, one contract file, one hour." Show `CONTRACT.md`.

## Architecture (Phase 1)

```
browser :5173  ── POST /api/jobs (video) ──▶  FastAPI :8000
   UploadFlow  ◀── GET /api/jobs/{id} (1 s poll) ──  stage machine (≤ 20 s)
                                                      ├─ ffmpeg: real frames
                                                      ├─ Claude Fable 5.1 vision: real → scene
                                                      └─ poses / training / compressing: staged
   Play (#play) ◀── splatUrl + scene ──  /files/worlds/room.splat
   Three.js + Spark splat renderer · pointer lock · WASD · floor + walls
```

## Cut, and why

| Spec item | Tonight | Reason |
|---|---|---|
| F# / Fable compiler / .NET | TypeScript + FastAPI | "Fable 5.1" tonight is the Claude model; `dotnet` is not installed; bindings cost the hour |
| COLMAP + nerfstudio training | staged + pre-trained world | needs CUDA + ~30 min |
| Rapier physics | fixed eye height + room bounds + gravity | splats have no mesh; same feel, zero WASM risk |
| WebSockets | 1 s polling | invisible to the audience |
| S3 / CDN | local disk | localhost demo |

## The split — nobody shares a folder

| Daniel | Shahar |
|---|---|
| repo, scaffold, `web/src/contract.ts`, `web/src/main.tsx`, `App.tsx` | `server/**` — upload, validation, ffmpeg frames, stage machine, static files |
| `web/src/play/**` — the world, controls, floor/walls, drop-in fall, HUD with Claude's narration | the Claude vision call → `scene` |
| `assets/worlds/room.splat` + its spawn/floor/bounds tuning | `web/src/upload/**` — drop zone, stage screen, frames strip, Claude's title, "Drop in" |
| integration owner + demo driver | server run command in `server/README.md` |

## Clock

| Time | Gate |
|---|---|
| 19:20 | Shahar has his prompt, scaffold is on `main` |
| 19:35 | Shahar: server answers the contract (staged) — PR merged. Daniel: walking in the room |
| 19:45 | Full flow on `main`: upload → stages → Claude title → Drop in → walk |
| 19:50 | **Freeze.** Fixes only. Run the demo twice. Record the backup |
| 19:55 | **Phase 1 done → Daniel pastes Phase 2** |

## Phase 1 is done when

1. `server` starts with one command; `web` starts with `npm run dev`.
2. A real video uploaded at `localhost:5173` walks every stage in ≤ 20 s, frames appear, Claude's title appears.
3. "Drop in" loads the world; WASD + mouse work; you cannot fall through the floor or leave the room.
4. The HUD shows Claude's narration and landmarks.
5. It ran twice in a row from a cold start, and a backup recording exists.

## If it breaks

| Failure | Fallback |
|---|---|
| Claude call slow or down | `scene` stays null → the world uses its built-in description; the job still finishes |
| ffmpeg missing | `imageio-ffmpeg` pip package (bundled binary) |
| Server dead on stage | `localhost:5173/#play` loads the world with no server at all |
| Venue Wi-Fi dead | everything is local except the Claude call — see row 1 |
