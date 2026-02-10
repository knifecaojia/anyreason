from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.tasks.handlers.freeform_asset_extraction_compare_preview import (
    FreeformAssetExtractionComparePreviewHandler,
)
from app.services.ai_asset_extraction_service import ai_asset_extraction_service


class _DummyReporter:
    def __init__(self) -> None:
        self.progress_updates: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        self.progress_updates.append(int(progress))


class _DummyAsset:
    def __init__(self, name: str) -> None:
        self._name = name

    def model_dump(self):
        return {"name": self._name, "type": "prop"}


class TestFreeformAssetExtractionComparePreviewHandler:
    @pytest.mark.asyncio(loop_scope="function")
    async def test_run_ok(self, db_session, monkeypatch):
        async def _fake_preview_from_text(*, db, user_id, script_text, model, prompt_template, temperature, max_tokens):
            return f"prompt:{model}", '{"world_unity":{},"assets":[]}', None, [_DummyAsset("A")]

        monkeypatch.setattr(ai_asset_extraction_service, "preview_from_text", _fake_preview_from_text)

        handler = FreeformAssetExtractionComparePreviewHandler()
        reporter = _DummyReporter()
        task = SimpleNamespace(
            user_id=uuid4(),
            input_json={
                "script_text": "hello",
                "config_a": {"model": "m1", "prompt_template": "p1"},
                "config_b": {"model": "m2", "prompt_template": "p2"},
                "temperature": None,
                "max_tokens": None,
            },
        )
        out = await handler.run(db=db_session, task=task, reporter=reporter)
        assert out["variant_a"]["final_prompt"] == "prompt:m1"
        assert out["variant_b"]["final_prompt"] == "prompt:m2"
        assert isinstance(out["variant_a"]["assets"], list) and out["variant_a"]["assets"]
        assert reporter.progress_updates[:2] == [5, 50]

    @pytest.mark.asyncio(loop_scope="function")
    async def test_run_requires_script_text(self, db_session):
        handler = FreeformAssetExtractionComparePreviewHandler()
        reporter = _DummyReporter()
        task = SimpleNamespace(
            user_id=uuid4(),
            input_json={
                "script_text": "   ",
                "config_a": {"model": "m1", "prompt_template": "p1"},
                "config_b": {"model": "m2", "prompt_template": "p2"},
            },
        )
        with pytest.raises(ValueError):
            await handler.run(db=db_session, task=task, reporter=reporter)
