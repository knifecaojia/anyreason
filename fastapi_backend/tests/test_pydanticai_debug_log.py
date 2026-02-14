from __future__ import annotations

import json

import pytest

from app.services.pydanticai_debug_log import create_pydanticai_debug_logger


@pytest.mark.asyncio
async def test_pydanticai_debug_log_writes_jsonl(tmp_path, monkeypatch):
    monkeypatch.setenv("PYDANTICAI_DEBUG_LOG", "1")
    monkeypatch.setenv("PYDANTICAI_DEBUG_LOG_DIR", str(tmp_path))

    logger = create_pydanticai_debug_logger(run_id="r1", tag="t")
    await logger.log("evt", {"a": 1})

    assert logger.file_path.exists()
    text = logger.file_path.read_text(encoding="utf-8").strip()
    obj = json.loads(text)
    assert obj["run_id"] == "r1"
    assert obj["event"] == "evt"
    assert obj["payload"]["a"] == 1
