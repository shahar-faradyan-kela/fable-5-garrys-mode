# DropIn — the contract (the only seam between `web/` and `server/`)

Change this file = tell the other dev first.

- Server: `http://localhost:8000` (FastAPI, CORS open to `http://localhost:5173`)
- Web: `http://localhost:5173` (Vite + React + TypeScript)

## Endpoints

| Call | Returns |
|---|---|
| `POST /api/jobs` — multipart, field `video` | `201 { "jobId": "abc123" }` · `400 { "error": "..." }` when the video is over 3 min or under 1080p |
| `GET /api/jobs/{jobId}` | `Job` (below) · `404` when unknown |
| `GET /files/...` | static files: extracted frames, splat worlds |

## Job

```ts
type Stage = "queued" | "extracting" | "poses" | "training" | "compressing" | "done" | "failed";

interface Job {
  id: string;
  stage: Stage;
  progress: number;        // 0..1, overall
  frames: string[];        // absolute URLs, filled once "extracting" ends
  scene: null | {          // written by Claude (vision over the frames)
    title: string;         // "The Island Rooftop"
    tagline: string;       // one line
    narration: string;     // 2-3 sentences, shown in the HUD on drop-in
    landmarks: string[];   // 3-5 things visible in the place
  };
  splatUrl: null | string; // absolute URL, set when stage === "done"
  error: null | string;
}
```

## Rules

- The web polls `GET /api/jobs/{id}` every 1 s. No WebSockets.
- Queued → done takes **20 s at most**. The demo is two minutes long.
- `scene` may arrive at any stage after `extracting`; the web never blocks on it.
- Play route: `http://localhost:5173/?job=<jobId>#play`.

## Who owns what (no two people in one folder)

| Path | Owner |
|---|---|
| `server/**` | Shahar |
| `web/src/upload/**` | Shahar |
| `web/src/play/**` | Daniel |
| `web/src/main.tsx`, `web/src/contract.ts`, scaffold, `assets/**` | Daniel |
