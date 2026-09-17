# DropIn server

FastAPI, in-memory jobs, one background task per job. No DB, no queue, no auth.

## Run

```bash
cd server
uv sync
uv run uvicorn main:app --reload --port 8000
```

Drop a real key into `server/.env` (`ANTHROPIC_API_KEY=sk-ant-...`) to get Claude's
scene titles. Without one, jobs still run end to end — `scene` just stays `null`.

## Env vars

| Var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | required for the Claude vision call (`server/.env`, gitignored) |
| `SKIP_VALIDATION=1` | bypass the >3min / <1080p checks on `POST /api/jobs` |
| `DEMO_WORLD` | override the splat filename served as `splatUrl` (default `room.splat`) |
| `PUBLIC_API_BASE` | override the base URL used to build absolute `frames`/`splatUrl` (default `http://localhost:8000`) |

## Endpoints

See `../CONTRACT.md`.
