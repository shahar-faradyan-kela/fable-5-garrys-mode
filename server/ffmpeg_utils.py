import glob
import os
import re
import shutil
import subprocess

_ffmpeg_path: str | None = None


def get_ffmpeg_path() -> str:
    global _ffmpeg_path
    if _ffmpeg_path:
        return _ffmpeg_path
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        _ffmpeg_path = system_ffmpeg
    else:
        import imageio_ffmpeg

        _ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    return _ffmpeg_path


def probe_video(path: str) -> tuple[float, int, int]:
    """Read duration (seconds) and resolution from `ffmpeg -i` stderr.

    There is no ffprobe bundled with imageio-ffmpeg, so this is the only
    probing path available in both the brew and pip-fallback cases.
    """
    result = subprocess.run(
        [get_ffmpeg_path(), "-i", path],
        capture_output=True,
        text=True,
    )
    stderr = result.stderr

    duration = 0.0
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", stderr)
    if m:
        hours, minutes, seconds = m.groups()
        duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)

    width = height = 0
    for line in stderr.splitlines():
        if "Video:" in line:
            wh = re.search(r"(\d{2,5})x(\d{2,5})", line)
            if wh:
                width, height = int(wh.group(1)), int(wh.group(2))
            break

    return duration, width, height


def extract_frames(
    video_path: str,
    out_dir: str,
    duration: float,
    max_frames: int = 12,
    max_fps: float = 2.0,
) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)

    fps = max_fps
    if duration and duration > 0:
        fps = min(max_fps, max_frames / duration)
    fps = max(fps, 0.1)

    pattern = os.path.join(out_dir, "frame_%02d.jpg")
    cmd = [
        get_ffmpeg_path(),
        "-y",
        "-i",
        video_path,
        "-vf",
        f"fps={fps:.4f},scale='min(1280,iw)':-2",
        "-frames:v",
        str(max_frames),
        "-q:v",
        "3",
        pattern,
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)

    return sorted(glob.glob(os.path.join(out_dir, "frame_*.jpg")))
