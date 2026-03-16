from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import BatchVideoAsset, BatchVideoHistory, BatchVideoJob, Task, User
from app.schemas_media import MediaResponse
from app.tasks.handlers.batch_video_asset_generate import BatchVideoAssetGenerateHandler


class _DummyReporter:
    def __init__(self):
        self.progress_calls: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        _ = payload
        self.progress_calls.append(progress)

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        _ = (message, level, payload)


@pytest.mark.asyncio(loop_scope="function")
async def test_batch_video_submit_preserves_provider_meta(db_session, monkeypatch):
    handler = BatchVideoAssetGenerateHandler()
    user_id = uuid4()
    job_id = uuid4()
    asset_id = uuid4()
    model_config_id = uuid4()

    async def _fake_resolve_image_bytes(db, user_id_arg, source_url):
        _ = (db, user_id_arg, source_url)
        return b"image-bytes", "image/png"

    async def _fake_submit_media_async(*, db, user_id, binding_key, model_config_id, prompt, param_json, category):
        _ = (db, user_id, binding_key, model_config_id, prompt, param_json, category)
        return SimpleNamespace(
            external_task_id="ext-123",
            provider="vidu",
            meta={
                "api_key": "secret-key",
                "base_url": "https://api.vidu.cn/ent/v2",
                "concurrency_config_id": "cfg-1",
            },
        )

    monkeypatch.setattr(handler, "_resolve_image_bytes", _fake_resolve_image_bytes)
    monkeypatch.setattr(
        "app.tasks.handlers.batch_video_asset_generate.ai_gateway_service.submit_media_async",
        _fake_submit_media_async,
    )

    task = SimpleNamespace(
        user_id=user_id,
        input_json={
            "job_id": str(job_id),
            "asset_id": str(asset_id),
            "source_url": "/api/v1/vfs/nodes/source/download",
            "prompt": "animate this",
            "config": {
                "duration": 3,
                "resolution": "1280x720",
                "off_peak": False,
                "model_config_id": str(model_config_id),
            },
        },
    )

    result = await handler.submit(db=db_session, task=task, reporter=_DummyReporter())

    assert result.external_task_id == "ext-123"
    assert result.provider == "vidu"
    assert result.meta == {
        "api_key": "secret-key",
        "base_url": "https://api.vidu.cn/ent/v2",
        "concurrency_config_id": "cfg-1",
        "job_id": str(job_id),
        "asset_id": str(asset_id),
    }


@pytest.mark.asyncio(loop_scope="function")
async def test_batch_video_on_external_complete_persists_long_result_url(db_session, monkeypatch):
    handler = BatchVideoAssetGenerateHandler()
    user_id = uuid4()
    job_id = uuid4()
    asset_id = uuid4()
    task_id = uuid4()

    db_session.add(
        User(
            id=user_id,
            email="batch-video-long-url@example.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
    )
    db_session.add(
        BatchVideoJob(
            id=job_id,
            user_id=user_id,
            title="job",
            total_assets=1,
            completed_assets=0,
        )
    )
    db_session.add(
        BatchVideoAsset(
            id=asset_id,
            job_id=job_id,
            source_url="https://example.com/source.png",
            status="pending",
        )
    )
    db_session.add(
        Task(
            id=task_id,
            user_id=user_id,
            type="batch_video_asset_generate",
            status="waiting_external",
            progress=10,
            input_json={"job_id": str(job_id), "asset_id": str(asset_id)},
        )
    )
    db_session.add(
        BatchVideoHistory(
            asset_id=asset_id,
            task_id=task_id,
            status="pending",
            progress=0,
        )
    )
    await db_session.commit()

    async def _fake_save_video(*, db, user_id, job_id, asset_id, url):
        _ = (db, user_id, job_id, asset_id)
        return {"url": url, "file_node_id": str(uuid4()), "raw": {"url": url}}

    monkeypatch.setattr(handler, "_save_video", _fake_save_video)

    long_url = "https://example.com/video.mp4?" + ("token=" + "x" * 700)
    task = SimpleNamespace(
        id=task_id,
        user_id=user_id,
        input_json={"job_id": str(job_id), "asset_id": str(asset_id)},
    )

    result = await handler.on_external_complete(
        db=db_session,
        task=task,
        reporter=_DummyReporter(),
        media_response=MediaResponse(url=long_url, usage_id="u1", meta={}),
    )

    await db_session.refresh(await db_session.get(BatchVideoAsset, asset_id))
    asset = await db_session.get(BatchVideoAsset, asset_id)
    from sqlalchemy import select
    history = (await db_session.execute(select(BatchVideoHistory).where(BatchVideoHistory.task_id == task_id))).scalars().first()
    job = await db_session.get(BatchVideoJob, job_id)

    assert result["url"] == long_url
    assert asset is not None and asset.status == "completed"
    assert asset.result_url == long_url
    assert history is not None and history.status == "completed"
    assert history.result_url == long_url
    assert history.completed_at is not None and history.completed_at <= datetime.now(timezone.utc)
    assert job is not None and job.completed_assets == 1
    assert job.status == "completed"
