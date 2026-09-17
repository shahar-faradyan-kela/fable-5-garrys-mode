import asyncio
import base64
import json
import os
from pathlib import Path

import anthropic

from models import Scene

FABLE_MODEL = "claude-fable-5-1"
FALLBACK_MODEL = "claude-opus-4-8"
TIMEOUT_SECONDS = 15.0

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "tagline": {"type": "string"},
        "narration": {"type": "string"},
        "landmarks": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["title", "tagline", "narration", "landmarks"],
    "additionalProperties": False,
}

PROMPT = (
    "These frames are sampled evenly from a video someone just filmed of a real "
    "physical place, which is about to be reconstructed as a walkable 3D space. "
    "Look only at what's actually visible and describe the place:\n\n"
    "- title: a short, evocative name for the place\n"
    "- tagline: one punchy line about it\n"
    "- narration: 2-3 sentences, second person, as if the player has just landed "
    "inside this place — what it is, what stands out, what to walk toward\n"
    "- landmarks: 3-5 concrete, specific things you can actually see in the frames "
    "(name the real objects/features, not generic categories)"
)


def _pick_evenly(frames: list[str], target: int = 6) -> list[str]:
    if len(frames) <= target:
        return frames
    n = len(frames)
    idxs = sorted({round(i * (n - 1) / (target - 1)) for i in range(target)})
    return [frames[i] for i in idxs]


async def analyze_scene(frame_paths: list[str]) -> Scene | None:
    if not frame_paths or not os.environ.get("ANTHROPIC_API_KEY"):
        return None

    try:
        selected = _pick_evenly(frame_paths, target=6)
        content: list[dict] = []
        for path in selected:
            data = await asyncio.to_thread(Path(path).read_bytes)
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": base64.standard_b64encode(data).decode("utf-8"),
                    },
                }
            )
        content.append({"type": "text", "text": PROMPT})

        client = anthropic.AsyncAnthropic()
        response = await client.with_options(timeout=TIMEOUT_SECONDS).beta.messages.create(
            model=FABLE_MODEL,
            max_tokens=1024,
            betas=["server-side-fallback-2026-06-01"],
            fallbacks=[{"model": FALLBACK_MODEL}],
            output_config={"format": {"type": "json_schema", "schema": SCENE_SCHEMA}},
            messages=[{"role": "user", "content": content}],
        )

        if response.stop_reason == "refusal":
            return None

        text = next(b.text for b in response.content if b.type == "text")
        return Scene(**json.loads(text))
    except Exception as exc:
        print(f"[claude_vision] scene analysis failed: {type(exc).__name__}: {exc}")
        return None
