from __future__ import annotations

from pydantic import BaseModel


class SceneInfoRead(BaseModel):
    scene_code: str
    name: str
    type: str
    description: str | None = None
    builtin_agent_code: str | None = None

