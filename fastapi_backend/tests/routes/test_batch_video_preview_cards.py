from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import status

from app.models import BatchVideoAsset, BatchVideoHistory, BatchVideoJob, Task


async def _create_job_with_assets(db_session, user_id):
    job = BatchVideoJob(user_id=user_id, title="Preview Job", config={"duration": 3})
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    asset1 = BatchVideoAsset(
        job_id=job.id,
        source_url="/img/source-1.jpg",
        thumbnail_url="/img/thumb-1.jpg",
        prompt="镜头一提示词",
        index=0,
    )
    asset2 = BatchVideoAsset(
        job_id=job.id,
        source_url="/img/source-2.jpg",
        thumbnail_url="/img/thumb-2.jpg",
        prompt="镜头二提示词",
        index=1,
    )
    db_session.add_all([asset1, asset2])
    await db_session.commit()
    await db_session.refresh(asset1)
    await db_session.refresh(asset2)
    return job, asset1, asset2


async def _create_task(db_session, user_id, asset_id, *, status_value: str, progress: int, result_json=None, error=None):
    task = Task(
        user_id=user_id,
        type="batch_video_asset_generate",
        status=status_value,
        progress=progress,
        entity_type="batch_video_asset",
        entity_id=asset_id,
        input_json={"asset_id": str(asset_id)},
        result_json=result_json or {},
        error=error,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


class TestBatchVideoPreviewCards:
    @pytest.mark.asyncio(loop_scope="function")
    async def test_preview_cards_returns_asset_ordered_cards_with_latest_and_history(self, test_client, authenticated_user, db_session):
        job, asset1, asset2 = await _create_job_with_assets(db_session, authenticated_user["user"].id)

        old_task = await _create_task(
            db_session,
            authenticated_user["user"].id,
            asset1.id,
            status_value="failed",
            progress=100,
            error="首次失败",
        )
        latest_task = await _create_task(
            db_session,
            authenticated_user["user"].id,
            asset1.id,
            status_value="succeeded",
            progress=100,
            result_json={"url": "https://cdn.example.com/final-1.mp4"},
        )
        waiting_task = await _create_task(
            db_session,
            authenticated_user["user"].id,
            asset2.id,
            status_value="waiting_external",
            progress=10,
        )

        db_session.add_all(
            [
                BatchVideoHistory(
                    asset_id=asset1.id,
                    task_id=old_task.id,
                    status="failed",
                    progress=100,
                    error_message="首次失败",
                    created_at=datetime.now(timezone.utc) - timedelta(minutes=1),
                    completed_at=datetime.now(timezone.utc) - timedelta(minutes=1),
                ),
                BatchVideoHistory(
                    asset_id=asset1.id,
                    task_id=latest_task.id,
                    status="completed",
                    progress=100,
                    result_url="https://cdn.example.com/final-1.mp4",
                    created_at=datetime.now(timezone.utc),
                    completed_at=datetime.now(timezone.utc),
                ),
                BatchVideoHistory(
                    asset_id=asset2.id,
                    task_id=waiting_task.id,
                    status="processing",
                    progress=10,
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        await db_session.commit()

        res = await test_client.get(
            f"/api/v1/batch-video/jobs/{job.id}/preview-cards",
            headers=authenticated_user["headers"],
        )

        assert res.status_code == status.HTTP_200_OK
        data = res.json()["data"]
        assert data["job"]["id"] == str(job.id)
        cards = data["cards"]
        assert [card["asset_id"] for card in cards] == [str(asset1.id), str(asset2.id)]

        first = cards[0]
        assert first["prompt"] == "镜头一提示词"
        assert first["card_thumbnail_url"] == "/img/thumb-1.jpg"
        assert first["card_source_url"] == "/img/source-1.jpg"
        assert first["latest_task"]["task_id"] == str(latest_task.id)
        assert first["latest_task"]["status"] == "succeeded"
        assert first["latest_success"]["result_url"] == "https://cdn.example.com/final-1.mp4"
        assert [item["task_id"] for item in first["history"]] == [str(latest_task.id), str(old_task.id)]

        second = cards[1]
        assert second["latest_task"]["task_id"] == str(waiting_task.id)
        assert second["latest_task"]["status"] == "waiting_external"
        assert second["latest_success"] is None

    @pytest.mark.asyncio(loop_scope="function")
    async def test_retry_batch_video_task_creates_new_task_and_history(self, test_client, authenticated_user, db_session):
        job, asset1, _asset2 = await _create_job_with_assets(db_session, authenticated_user["user"].id)
        failed_task = await _create_task(
            db_session,
            authenticated_user["user"].id,
            asset1.id,
            status_value="failed",
            progress=100,
            error="失败待重试",
        )
        db_session.add(BatchVideoHistory(asset_id=asset1.id, task_id=failed_task.id, status="failed", progress=100, error_message="失败待重试"))
        await db_session.commit()

        res = await test_client.post(
            f"/api/v1/batch-video/tasks/{failed_task.id}/retry",
            headers=authenticated_user["headers"],
        )

        assert res.status_code == status.HTTP_200_OK
        body = res.json()["data"]
        assert body["task_id"] != str(failed_task.id)
        assert body["asset_id"] == str(asset1.id)
        assert body["status"] == "pending"

        preview = await test_client.get(
            f"/api/v1/batch-video/jobs/{job.id}/preview-cards",
            headers=authenticated_user["headers"],
        )
        cards = preview.json()["data"]["cards"]
        first = cards[0]
        assert len(first["history"]) == 2
        assert first["history"][0]["task_id"] == body["task_id"]

    @pytest.mark.asyncio(loop_scope="function")
    async def test_stop_batch_video_task_cancels_internal_and_reports_external_cancel_attempt(self, test_client, authenticated_user, db_session, monkeypatch):
        _job, asset1, _asset2 = await _create_job_with_assets(db_session, authenticated_user["user"].id)
        waiting_task = await _create_task(
            db_session,
            authenticated_user["user"].id,
            asset1.id,
            status_value="waiting_external",
            progress=10,
        )
        waiting_task.external_task_id = "930937932741632000"
        waiting_task.external_provider = "vidu"
        waiting_task.external_meta = {"job_id": str(uuid.uuid4())}
        await db_session.commit()

        async def fake_cancel_external_task(*, task, user_id):
            assert task.id == waiting_task.id
            assert user_id == authenticated_user["user"].id
            return {"attempted": True, "supported": False, "message": "provider_cancel_not_supported"}

        monkeypatch.setattr("app.api.v1.batch_video._cancel_external_task_if_possible", fake_cancel_external_task)

        res = await test_client.post(
            f"/api/v1/batch-video/tasks/{waiting_task.id}/stop",
            headers=authenticated_user["headers"],
        )

        assert res.status_code == status.HTTP_200_OK
        data = res.json()["data"]
        assert data["task_id"] == str(waiting_task.id)
        assert data["status"] == "canceled"
        assert data["external_cancel"]["attempted"] is True
        assert data["external_cancel"]["supported"] is False
