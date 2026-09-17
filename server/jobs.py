import asyncio
import os

from claude_vision import analyze_scene
from ffmpeg_utils import extract_frames, photo_to_frame
from models import Job

JOBS: dict[str, Job] = {}

# Real stage: extracting. Staged stages: poses, training, compressing.
# Durations are tuned so a typical short demo clip finishes well under 20s.
STAGE_DURATIONS = {
    "poses": 3.0,
    "training": 7.0,
    "compressing": 3.0,
}
STAGE_PROGRESS_BOUNDS = {
    "extracting": (0.02, 0.35),
    "poses": (0.35, 0.55),
    "training": (0.55, 0.85),
    "compressing": (0.85, 0.98),
}


async def _tick_progress(job: Job, start: float, end: float, duration: float, steps: int = 20):
    step_duration = duration / steps
    for i in range(1, steps + 1):
        await asyncio.sleep(step_duration)
        job.progress = start + (end - start) * i / steps


async def run_job(job_id: str, video_path: str, duration_hint: float, base_url: str, is_photo: bool = False):
    job = JOBS[job_id]
    try:
        job.stage = "extracting"
        job.progress = STAGE_PROGRESS_BOUNDS["extracting"][0]

        frames_dir = os.path.join(os.path.dirname(video_path), "frames")
        if is_photo:
            frame_paths = await asyncio.to_thread(photo_to_frame, video_path, frames_dir)
        else:
            frame_paths = await asyncio.to_thread(
                extract_frames, video_path, frames_dir, duration_hint
            )
        job.progress = STAGE_PROGRESS_BOUNDS["extracting"][1]
        job.frames = [
            f"{base_url}/files/{job_id}/frames/{os.path.basename(p)}" for p in frame_paths
        ]

        # Runs concurrently with the staged stages below. `scene` may land at any
        # point after extracting, or stay null on failure/timeout — the job still
        # finishes either way.
        scene_task = asyncio.create_task(analyze_scene(frame_paths))

        def _on_scene_done(task: asyncio.Task):
            if task.cancelled():
                return
            try:
                job.scene = task.result()
            except Exception:
                job.scene = None

        scene_task.add_done_callback(_on_scene_done)

        for stage in ("poses", "training", "compressing"):
            job.stage = stage
            start, end = STAGE_PROGRESS_BOUNDS[stage]
            await _tick_progress(job, start, end, STAGE_DURATIONS[stage])

        job.splatUrl = f"{base_url}/files/worlds/{os.environ.get('DEMO_WORLD', 'room.splat')}"
        job.progress = 1.0
        job.stage = "done"
    except Exception as exc:
        job.stage = "failed"
        job.error = str(exc)
