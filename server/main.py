import asyncio
import os
import shutil
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from ffmpeg_utils import probe_video
from jobs import JOBS, run_job
from models import Job

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
WORLDS_DIR = BASE_DIR.parent / "assets" / "worlds"
DATA_DIR.mkdir(exist_ok=True)

MAX_DURATION_SECONDS = 180
MIN_SHORT_SIDE = 1080

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Order matters: the more specific mount must be registered first, or /files
# swallows every request before /files/worlds gets a chance to match.
app.mount("/files/worlds", StaticFiles(directory=str(WORLDS_DIR)), name="worlds")
app.mount("/files", StaticFiles(directory=str(DATA_DIR)), name="files")


@app.post("/api/jobs", status_code=201)
async def create_job(video: UploadFile = File(...)):
    job_id = uuid.uuid4().hex[:12]
    job_dir = DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    video_path = job_dir / f"original{suffix}"
    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    duration, width, height = probe_video(str(video_path))

    if os.environ.get("SKIP_VALIDATION") != "1":
        if duration > MAX_DURATION_SECONDS:
            shutil.rmtree(job_dir, ignore_errors=True)
            return JSONResponse(
                status_code=400,
                content={"error": f"Video is {duration:.0f}s long — please keep it under 3 minutes."},
            )
        short_side = min(width, height) if width and height else 0
        if short_side < MIN_SHORT_SIDE:
            resolution = f"{width}x{height}" if width and height else "unknown"
            shutil.rmtree(job_dir, ignore_errors=True)
            return JSONResponse(
                status_code=400,
                content={"error": f"Video resolution is {resolution} — please upload at least 1080p."},
            )

    JOBS[job_id] = Job(id=job_id)
    asyncio.create_task(run_job(job_id, str(video_path), duration))
    return {"jobId": job_id}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        return JSONResponse(status_code=404, content={"error": "job not found"})
    return job
