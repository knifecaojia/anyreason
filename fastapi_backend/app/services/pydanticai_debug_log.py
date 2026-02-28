from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _sanitize_event(value: Any, depth: int = 0) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if depth >= 3:
        return str(value)
    if isinstance(value, dict):
        return {str(k): _sanitize_event(v, depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_event(v, depth + 1) for v in value]
    return str(value)


def is_pydanticai_debug_enabled() -> bool:
    v = str(os.getenv("PYDANTICAI_DEBUG_LOG", "")).strip().lower()
    if v in {"1", "true", "yes", "y", "on"}:
        return True
    return False


def get_pydanticai_debug_log_dir() -> Path:
    env_dir = str(os.getenv("PYDANTICAI_DEBUG_LOG_DIR", "")).strip()
    if env_dir:
        return Path(env_dir)
    # 优先使用 settings 中的 LOGS_ROOT，如果未定义则回退到当前工作目录下的 logs
    logs_root = getattr(settings, "LOGS_ROOT", None)
    if not logs_root:
        # 默认使用项目根目录下的 logs 文件夹（假设 app/services/pydanticai_debug_log.py 位于项目深层）
        # 这里尝试向上寻找项目根目录，或者简单地使用 cwd
        # 稳妥起见，使用 current working directory 下的 logs
        logs_root = Path.cwd() / "logs"
    
    return Path(logs_root) / "pydanticai_debug"


@dataclass
class PydanticAIDebugLogger:
    run_id: str
    file_path: Path
    _lock: asyncio.Lock
    force_enable: bool = False

    async def log(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        if not (self.force_enable or is_pydanticai_debug_enabled()):
            return
        evt = {
            "ts": _now_iso(),
            "run_id": self.run_id,
            "event": str(event_type),
            "payload": _sanitize_event(payload or {}),
        }
        line = json.dumps(evt, ensure_ascii=False, default=_json_default) + "\n"
        async with self._lock:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.file_path, "a", encoding="utf-8") as f:
                f.write(line)


_LOCKS: dict[str, asyncio.Lock] = {}


def create_pydanticai_debug_logger_for_path(*, run_id: str, file_path: Path, force_enable: bool = False) -> PydanticAIDebugLogger:
    lock = _LOCKS.setdefault(str(file_path), asyncio.Lock())
    return PydanticAIDebugLogger(run_id=run_id, file_path=file_path, _lock=lock, force_enable=force_enable)


def create_pydanticai_debug_logger(*, run_id: str, tag: str, force_enable: bool = False) -> PydanticAIDebugLogger:
    safe_tag = "".join(c if c.isalnum() or c in {"-", "_"} else "_" for c in (tag or "run"))
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    dir_path = get_pydanticai_debug_log_dir()
    file_path = dir_path / f"{ts}_{safe_tag}_{run_id}.jsonl"
    lock = _LOCKS.setdefault(str(file_path), asyncio.Lock())
    return PydanticAIDebugLogger(run_id=run_id, file_path=file_path, _lock=lock, force_enable=force_enable)
