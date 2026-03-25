from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ResolvedModelConfig:
    category: str
    manufacturer: str
    provider: str | None
    model: str
    api_key: str
    base_url: str | None = None
    config_id: UUID | None = None
