from __future__ import annotations

from typing import Any


def pydantic_ai_available() -> bool:
    try:
        import pydantic_ai  # noqa: F401
    except Exception:
        return False
    return True


def get_pydantic_ai_agent(*, model: str, instructions: str, **kwargs: Any):
    try:
        from pydantic_ai import Agent
    except Exception as e:
        raise RuntimeError("pydantic_ai_not_installed") from e
    return Agent(model, instructions=instructions, **kwargs)

