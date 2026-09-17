# Prompt for Daniel's Claude Code (Fable 5.1)

You are building half of **DropIn** at a one-hour hackathon. Demo at 20:00, two minutes, live. Read `PLAN.md` and `CONTRACT.md`. I own the 3D world and the integration; Shahar owns `server/**` and `web/src/upload/**` — never edit those.

## I own
`web/src/play/**`, `web/src/contract.ts`, `web/src/App.tsx`, `web/src/main.tsx`, `web/src/index.css`, `assets/**`, `PLAN.md`, `CONTRACT.md`.

## Build in this order
1. **The world** — `web/src/play/`: Three.js + `@sparkjsdev/spark` (`SparkRenderer` + `SplatMesh`), load `splatUrl`, show download progress.
2. **The controller** — PointerLockControls, WASD + arrows, Shift sprint, Space jump, smooth acceleration. Gravity with a fixed eye height as the floor; room bounds as the walls. Per-world config (`worlds.ts`): flip, spawn, yaw, eyeY, bounds, speed — tuned by eye for `room.splat`. Debug overlay on `P` (position readout) and fly mode on `F` for tuning.
3. **The drop-in** — spawn above the floor and fall into the room on first pointer lock.
4. **The HUD** — Claude's title, tagline, narration and landmarks from `job.scene`; a "seen by Claude Fable 5.1" label; controls hint; click-to-enter overlay.
5. **Data source** — `?job=<id>` → `getJob()` → `splatUrl` + `scene`. No job, or the server is down → the built-in world and description, so `/#play` always works.
6. **Integration** at 19:45 with Shahar's server on `main`; run the demo script in `PLAN.md` twice; record the backup.

## Git
Branch `daniel/<thing>` → PR → merge at once. Pull before every branch.

## Done means
Phase 1 checklist in `PLAN.md` passes twice from a cold start. Then tell Daniel: **"Phase 1 is done — paste Phase 2."**
