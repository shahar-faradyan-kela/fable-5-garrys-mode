# DropIn server

FastAPI, in-memory jobs, one background task per job. No DB, no queue, no auth.

## Run

```bash
cd server
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Drop a real key into `server/.env` (`ANTHROPIC_API_KEY=sk-ant-...`) to get Claude's
scene titles. Without one, jobs still run end to end — `scene` just stays `null`.

## Env vars

| Var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | required for the Claude vision call (`server/.env`, gitignored) |
| `SKIP_VALIDATION=1` | bypass the >3min / <720p checks on `POST /api/jobs` (photos skip them anyway) |
| `DEMO_WORLD` | override the splat filename served as `splatUrl` (default `room.splat`) |

## Endpoints

See `../CONTRACT.md`.
