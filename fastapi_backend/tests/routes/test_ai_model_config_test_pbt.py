"""Property-based tests for async model test endpoints (test-image / test-video).

Uses Hypothesis library for property-based testing.
Each property test runs at least 100 iterations.
"""
from __future__ import annotations

import hypothesis.strategies as st
import pytest
from hypothesis import given, settings, HealthCheck


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Non-empty text for prompts (printable, reasonable length)
prompt_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=120,
).filter(lambda s: s.strip())

# Resolution strings like "1024x1024", "512x768", etc.
resolution_st = st.one_of(
    st.none(),
    st.builds(
        lambda w, h: f"{w}x{h}",
        st.sampled_from([256, 512, 768, 1024, 2048]),
        st.sampled_from([256, 512, 768, 1024, 2048]),
    ),
)

# Duration for video (seconds)
duration_st = st.one_of(st.none(), st.integers(min_value=1, max_value=60))

# Aspect ratio strings
aspect_ratio_st = st.one_of(
    st.none(),
    st.sampled_from(["16:9", "9:16", "4:3", "3:4", "1:1"]),
)

# Sync-era result fields that must NOT appear in async responses
_SYNC_RESULT_FIELDS = {"url", "run_id", "output_file_node_id", "output_content_type", "raw"}


async def _ensure_model_config(test_client, headers, *, category: str) -> str:
    """Create or retrieve a model config for the given category.

    Returns the model_config_id. Handles 409 Conflict (already exists) by
    listing configs and finding the matching one.
    """
    if category == "image":
        payload = {
            "category": "image",
            "manufacturer": "doubao",
            "model": "doubao-seedream-4.5",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        }
    else:
        payload = {
            "category": "video",
            "manufacturer": "dashscope",
            "model": "wanx2.1-t2v-turbo",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        }

    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=headers,
        json=payload,
    )
    if res.status_code == 200:
        return res.json()["data"]["id"]

    # 409 Conflict — config already exists, list and find it
    list_res = await test_client.get(
        f"/api/v1/ai/admin/model-configs?category={category}",
        headers=headers,
    )
    assert list_res.status_code == 200
    configs = list_res.json()["data"]
    for cfg in configs:
        if cfg["manufacturer"] == payload["manufacturer"] and cfg["model"] == payload["model"]:
            return cfg["id"]
    raise AssertionError(f"Could not find or create model config for {category}")


# Feature: model-test-async-tasks, Property 1: 异步端点响应格式
# **Validates: Requirements 1.2, 2.2, 3.1, 3.2, 3.4**
class TestAsyncEndpointResponseFormat:
    """For any valid model test request (image or video) with a valid prompt
    and model_config_id, the endpoint should return a response containing:
      - task_id (non-empty string)
      - session_id (non-empty string)
    And the response must NOT contain sync-era generation result fields
    (url, run_id, output_file_node_id, output_content_type, raw)."""

    @given(prompt=prompt_st, resolution=resolution_st)
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_image_endpoint_returns_task_and_session_only(
        self,
        prompt: str,
        resolution: str | None,
        test_client,
        authenticated_superuser,
    ):
        model_config_id = await _ensure_model_config(
            test_client, authenticated_superuser["headers"], category="image"
        )

        # Build request body
        body: dict = {"prompt": prompt}
        if resolution is not None:
            body["resolution"] = resolution

        res = await test_client.post(
            f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
            headers=authenticated_superuser["headers"],
            json=body,
        )
        assert res.status_code == 200

        data = res.json()["data"]

        # Must contain non-empty task_id and session_id
        assert "task_id" in data
        assert isinstance(data["task_id"], str)
        assert len(data["task_id"].strip()) > 0

        assert "session_id" in data
        assert isinstance(data["session_id"], str)
        assert len(data["session_id"].strip()) > 0

        # Must NOT contain sync-era generation result fields
        for field in _SYNC_RESULT_FIELDS:
            assert field not in data, f"Unexpected sync field '{field}' in async response"

    @given(prompt=prompt_st, duration=duration_st, aspect_ratio=aspect_ratio_st)
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_video_endpoint_returns_task_and_session_only(
        self,
        prompt: str,
        duration: int | None,
        aspect_ratio: str | None,
        test_client,
        authenticated_superuser,
    ):
        model_config_id = await _ensure_model_config(
            test_client, authenticated_superuser["headers"], category="video"
        )

        # Build request body
        body: dict = {"prompt": prompt}
        if duration is not None:
            body["duration"] = duration
        if aspect_ratio is not None:
            body["aspect_ratio"] = aspect_ratio

        res = await test_client.post(
            f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
            headers=authenticated_superuser["headers"],
            json=body,
        )
        assert res.status_code == 200

        data = res.json()["data"]

        # Must contain non-empty task_id and session_id
        assert "task_id" in data
        assert isinstance(data["task_id"], str)
        assert len(data["task_id"].strip()) > 0

        assert "session_id" in data
        assert isinstance(data["session_id"], str)
        assert len(data["session_id"].strip()) > 0

        # Must NOT contain sync-era generation result fields
        for field in _SYNC_RESULT_FIELDS:
            assert field not in data, f"Unexpected sync field '{field}' in async response"


# ---------------------------------------------------------------------------
# Strategy: data URL list (for image endpoint attachments)
# ---------------------------------------------------------------------------

_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

# Generate a valid data URL: "data:<mime>;base64,<chars>"
_data_url_st = st.builds(
    lambda mime, payload: f"data:{mime};base64,{payload}",
    st.sampled_from(_MIME_TYPES),
    # Short base64-ish payload (real base64 chars only)
    st.from_regex(r"[A-Za-z0-9+/]{4,40}={0,2}", fullmatch=True),
)

# Optional list of data URLs (None or 1-3 items)
image_data_urls_st = st.one_of(
    st.none(),
    st.lists(_data_url_st, min_size=1, max_size=3),
)


# Feature: model-test-async-tasks, Property 5: Task input_json 包含 session_id 和预处理后的附件数据
# **Validates: Requirements 3.3, 6.2**
class TestTaskInputJsonContainsSessionAndAttachments:
    """For any Task created via model test endpoints, its input_json must
    contain session_id (non-empty) and model_config_id (non-empty).
    When image_data_urls are provided, they must appear in input_json and
    each element must start with 'data:'."""

    @given(prompt=prompt_st, resolution=resolution_st, data_urls=image_data_urls_st)
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_image_input_json_has_session_and_attachments(
        self,
        prompt: str,
        resolution: str | None,
        data_urls: list[str] | None,
        test_client,
        authenticated_superuser,
        monkeypatch,
    ):
        from app.services.task_service import task_service
        from app.services.storage.vfs_service import vfs_service
        from app.models import FileNode
        from uuid import uuid4 as _uuid4

        model_config_id = await _ensure_model_config(
            test_client, authenticated_superuser["headers"], category="image"
        )

        # Spy on create_task to capture input_json
        captured: list = []
        _orig = task_service.create_task

        async def _spy(*, db, user_id, payload):
            captured.append(payload)
            return await _orig(db=db, user_id=user_id, payload=payload)

        monkeypatch.setattr(task_service, "create_task", _spy)

        # Mock vfs create_bytes_file so data-URL attachments can be persisted
        async def _fake_create_bytes(*, db, user_id, name, data, content_type, **kw):
            node = FileNode(
                id=_uuid4(),
                name=name,
                is_folder=False,
                created_by=user_id,
                minio_bucket="test",
                minio_key=f"test/{_uuid4()}/{name}",
                content_type=content_type,
                size_bytes=len(data or b""),
            )
            db.add(node)
            await db.flush()
            return node

        monkeypatch.setattr(vfs_service, "create_bytes_file", _fake_create_bytes)

        body: dict = {"prompt": prompt}
        if resolution is not None:
            body["resolution"] = resolution
        if data_urls is not None:
            body["image_data_urls"] = data_urls

        res = await test_client.post(
            f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
            headers=authenticated_superuser["headers"],
            json=body,
        )
        assert res.status_code == 200

        assert len(captured) >= 1
        ij = captured[-1].input_json

        # session_id must be present and non-empty
        assert "session_id" in ij
        assert isinstance(ij["session_id"], str)
        assert len(ij["session_id"].strip()) > 0

        # model_config_id must be present and non-empty
        assert "model_config_id" in ij
        assert isinstance(ij["model_config_id"], str)
        assert len(ij["model_config_id"].strip()) > 0

        # When data_urls were provided, they must appear in input_json
        if data_urls is not None and len(data_urls) > 0:
            assert "image_data_urls" in ij
            assert isinstance(ij["image_data_urls"], list)
            assert len(ij["image_data_urls"]) == len(data_urls)
            for url in ij["image_data_urls"]:
                assert url.startswith("data:"), f"Expected data URL, got: {url[:40]}"

    @given(prompt=prompt_st, duration=duration_st, aspect_ratio=aspect_ratio_st)
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_video_input_json_has_session_and_model_config(
        self,
        prompt: str,
        duration: int | None,
        aspect_ratio: str | None,
        test_client,
        authenticated_superuser,
        monkeypatch,
    ):
        from app.services.task_service import task_service

        model_config_id = await _ensure_model_config(
            test_client, authenticated_superuser["headers"], category="video"
        )

        # Spy on create_task to capture input_json
        captured: list = []
        _orig = task_service.create_task

        async def _spy(*, db, user_id, payload):
            captured.append(payload)
            return await _orig(db=db, user_id=user_id, payload=payload)

        monkeypatch.setattr(task_service, "create_task", _spy)

        body: dict = {"prompt": prompt}
        if duration is not None:
            body["duration"] = duration
        if aspect_ratio is not None:
            body["aspect_ratio"] = aspect_ratio

        res = await test_client.post(
            f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
            headers=authenticated_superuser["headers"],
            json=body,
        )
        assert res.status_code == 200

        assert len(captured) >= 1
        ij = captured[-1].input_json

        # session_id must be present and non-empty
        assert "session_id" in ij
        assert isinstance(ij["session_id"], str)
        assert len(ij["session_id"].strip()) > 0

        # model_config_id must be present and non-empty
        assert "model_config_id" in ij
        assert isinstance(ij["model_config_id"], str)
        assert len(ij["model_config_id"].strip()) > 0
