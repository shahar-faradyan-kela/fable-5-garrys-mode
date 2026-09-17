from typing import Literal, Optional

from pydantic import BaseModel

Stage = Literal[
    "queued", "extracting", "poses", "training", "compressing", "done", "failed"
]


class Scene(BaseModel):
    title: str
    tagline: str
    narration: str
    landmarks: list[str]


class Job(BaseModel):
    id: str
    stage: Stage = "queued"
    progress: float = 0.0
    frames: list[str] = []
    scene: Optional[Scene] = None
    splatUrl: Optional[str] = None
    error: Optional[str] = None
