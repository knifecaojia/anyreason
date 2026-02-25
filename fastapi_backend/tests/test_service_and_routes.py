"""Unit tests for service layer and API route migration.

Validates:
- Requirements 3.1: generate_media() handles all image category requests
- Requirements 3.2: generate_media() handles all video category requests
- Requirements 4.1: Image API route calls generate_media(category="image")
- Requirements 4.2: Video API route calls generate_media(category="video")
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.service import AIGatewayService
from app.ai_gateway.types import ResolvedModelConfig
from app.core.exceptions import AppError
from app.schemas_media import MediaRequest, MediaResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_resolved_config(category: str = "image", manufacturer: str = "aliyun") -> ResolvedModelConfig:
    return ResolvedModelConfig(
        category=category,
        manufacturer=manufacturer,
        model="test-model-v1",
        api_key="test-api-key",
        base_url="https://api.test.example.com",
    )


def _make_media_response(url: str = "https://cdn.example.com/result.png") -> MediaResponse:
    return MediaResponse(url=url, usage_id="usage-123", meta={"provider": "test"})


def _mock_db_session() -> AsyncMock:
    """Create a mock AsyncSession with commit/rollback/add support."""
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    return db


# ---------------------------------------------------------------------------
# Service layer: generate_media() routing (Requirements 3.1, 3.2)
# ---------------------------------------------------------------------------

class TestGenerateMediaImageRouting:
    """Verify generate_media(category='image') routes to image providers via MediaProviderFactory."""

    @pytest.mark.asyncio
    async def test_image_category_uses_media_provider_factory(self):
        """generate_media(category='image') should call media_provider_factory.get_provider()
        and invoke provider.generate() with a MediaRequest."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="image", manufacturer="aliyun")
        cfg_id = uuid.uuid4()
        expected_response = _make_media_response("https://cdn.example.com/image.png")

        mock_provider = AsyncMock(spec=MediaProvider)
        mock_provider.generate = AsyncMock(return_value=expected_response)

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "image"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.return_value = mock_provider
            mock_credit.adjust_balance = AsyncMock()

            result = await service.generate_media(
                db=db,
                user_id=user_id,
                binding_key="image",
                model_config_id=None,
                prompt="a beautiful sunset",
                param_json={"resolution": "1024x1024"},
                category="image",
            )

            # Verify factory was called with correct manufacturer
            mock_factory.get_provider.assert_called_once_with(
                manufacturer="aliyun",
                api_key="test-api-key",
                base_url="https://api.test.example.com",
            )
            # Verify provider.generate() was called
            mock_provider.generate.assert_called_once()
            call_args = mock_provider.generate.call_args
            request: MediaRequest = call_args[0][0]
            assert request.model_key == "test-model-v1"
            assert request.prompt == "a beautiful sunset"
            assert request.param_json == {"resolution": "1024x1024"}

            # Verify response
            assert result == expected_response
            assert result.url == "https://cdn.example.com/image.png"

    @pytest.mark.asyncio
    async def test_image_category_deducts_credits(self):
        """generate_media(category='image') should deduct credits before calling provider."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="image")
        cfg_id = uuid.uuid4()

        mock_provider = AsyncMock(spec=MediaProvider)
        mock_provider.generate = AsyncMock(return_value=_make_media_response())

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "image"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.return_value = mock_provider
            mock_credit.adjust_balance = AsyncMock()

            await service.generate_media(
                db=db, user_id=user_id, binding_key="image",
                model_config_id=None, prompt="test", category="image",
            )

            # Credits should be deducted (5 for image)
            mock_credit.adjust_balance.assert_called_once()
            call_kwargs = mock_credit.adjust_balance.call_args.kwargs
            assert call_kwargs["delta"] == -5
            assert call_kwargs["reason"] == "ai.consume"

    @pytest.mark.asyncio
    async def test_image_category_refunds_on_provider_error(self):
        """generate_media(category='image') should refund credits when provider raises."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="image")
        cfg_id = uuid.uuid4()

        mock_provider = AsyncMock(spec=MediaProvider)
        mock_provider.generate = AsyncMock(side_effect=RuntimeError("upstream failure"))

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "image"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.return_value = mock_provider
            mock_credit.adjust_balance = AsyncMock()

            with pytest.raises(AppError) as exc_info:
                await service.generate_media(
                    db=db, user_id=user_id, binding_key="image",
                    model_config_id=None, prompt="test", category="image",
                )

            assert exc_info.value.code == 502

            # Should have 2 calls: deduct + refund
            assert mock_credit.adjust_balance.call_count == 2
            refund_kwargs = mock_credit.adjust_balance.call_args_list[1].kwargs
            assert refund_kwargs["delta"] == 5  # positive = refund
            assert refund_kwargs["reason"] == "ai.refund"


class TestGenerateMediaVideoRouting:
    """Verify generate_media(category='video') routes to video providers via MediaProviderFactory."""

    @pytest.mark.asyncio
    async def test_video_category_uses_media_provider_factory(self):
        """generate_media(category='video') should call media_provider_factory.get_provider()
        and invoke provider.generate() with a MediaRequest."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="video", manufacturer="volcengine_video")
        cfg_id = uuid.uuid4()
        expected_response = _make_media_response("https://cdn.example.com/video.mp4")

        mock_provider = AsyncMock(spec=MediaProvider)
        mock_provider.generate = AsyncMock(return_value=expected_response)

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "video"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.return_value = mock_provider
            mock_credit.adjust_balance = AsyncMock()

            result = await service.generate_media(
                db=db,
                user_id=user_id,
                binding_key="video",
                model_config_id=None,
                prompt="a running dog",
                param_json={"duration": 10, "aspect_ratio": "16:9"},
                category="video",
            )

            # Verify factory was called with correct manufacturer
            mock_factory.get_provider.assert_called_once_with(
                manufacturer="volcengine_video",
                api_key="test-api-key",
                base_url="https://api.test.example.com",
            )
            # Verify provider.generate() was called with correct request
            mock_provider.generate.assert_called_once()
            call_args = mock_provider.generate.call_args
            request: MediaRequest = call_args[0][0]
            assert request.model_key == "test-model-v1"
            assert request.prompt == "a running dog"
            assert request.param_json == {"duration": 10, "aspect_ratio": "16:9"}

            # Verify response
            assert result == expected_response
            assert result.url == "https://cdn.example.com/video.mp4"

    @pytest.mark.asyncio
    async def test_video_category_deducts_higher_credits(self):
        """generate_media(category='video') should deduct 10 credits (more than image)."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="video", manufacturer="volcengine_video")
        cfg_id = uuid.uuid4()

        mock_provider = AsyncMock(spec=MediaProvider)
        mock_provider.generate = AsyncMock(return_value=_make_media_response())

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "video"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.return_value = mock_provider
            mock_credit.adjust_balance = AsyncMock()

            await service.generate_media(
                db=db, user_id=user_id, binding_key="video",
                model_config_id=None, prompt="test", category="video",
            )

            # Credits should be deducted (10 for video)
            mock_credit.adjust_balance.assert_called_once()
            call_kwargs = mock_credit.adjust_balance.call_args.kwargs
            assert call_kwargs["delta"] == -10

    @pytest.mark.asyncio
    async def test_video_category_records_usage_event(self):
        """generate_media(category='video') should record an AIUsageEvent."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="video", manufacturer="vidu")
        cfg_id = uuid.uuid4()
        response = _make_media_response("https://cdn.example.com/vid.mp4")

        mock_provider = AsyncMock(spec=MediaProvider)
        mock_provider.generate = AsyncMock(return_value=response)

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "video"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.return_value = mock_provider
            mock_credit.adjust_balance = AsyncMock()

            await service.generate_media(
                db=db, user_id=user_id, binding_key="video",
                model_config_id=None, prompt="test", category="video",
            )

            # db.add should have been called with an AIUsageEvent
            db.add.assert_called_once()
            usage_event = db.add.call_args[0][0]
            assert usage_event.category == "video"
            assert usage_event.user_id == user_id

    @pytest.mark.asyncio
    async def test_unsupported_manufacturer_raises_app_error(self):
        """generate_media() should propagate AppError when factory raises for unknown manufacturer."""
        service = AIGatewayService()
        db = _mock_db_session()
        user_id = uuid.uuid4()
        cfg = _make_resolved_config(category="image", manufacturer="nonexistent_vendor")
        cfg_id = uuid.uuid4()

        with patch.object(
            service, "_resolve_model_config", new_callable=AsyncMock,
            return_value=(cfg, cfg_id, "image"),
        ), patch(
            "app.ai_gateway.service.media_provider_factory"
        ) as mock_factory, patch(
            "app.ai_gateway.service.credit_service"
        ) as mock_credit:
            mock_factory.get_provider.side_effect = AppError(
                msg="Unsupported media provider: nonexistent_vendor", code=400, status_code=400
            )
            mock_credit.adjust_balance = AsyncMock()

            with pytest.raises(AppError) as exc_info:
                await service.generate_media(
                    db=db, user_id=user_id, binding_key="image",
                    model_config_id=None, prompt="test", category="image",
                )

            assert exc_info.value.code == 400
            assert "nonexistent_vendor" in exc_info.value.msg


# ---------------------------------------------------------------------------
# API Route tests: /ai/image/generate (Requirement 4.1)
# ---------------------------------------------------------------------------

class TestImageAPIRoute:
    """Verify /ai/image/generate calls generate_media(category='image') and
    returns the expected response format."""

    @pytest.mark.asyncio
    async def test_image_route_calls_generate_media_with_image_category(
        self, test_client, authenticated_user, db_session,
    ):
        """POST /v1/ai/image/generate should call generate_media(category='image')."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/generated.png")

        with patch(
            "app.api.v1.ai_image.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_gen:
            resp = await test_client.post(
                "/api/v1/ai/image/generate",
                headers=headers,
                json={
                    "prompt": "a beautiful landscape",
                    "resolution": "1024x1024",
                    "binding_key": "image",
                },
            )

            assert resp.status_code == 200
            body = resp.json()
            assert body["code"] == 200
            assert body["data"]["url"] == "https://cdn.example.com/generated.png"

            # Verify generate_media was called with category="image"
            mock_gen.assert_called_once()
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["category"] == "image"
            assert call_kwargs["prompt"] == "a beautiful landscape"
            assert call_kwargs["param_json"]["resolution"] == "1024x1024"

    @pytest.mark.asyncio
    async def test_image_route_passes_images_as_data_urls(
        self, test_client, authenticated_user, db_session,
    ):
        """POST /v1/ai/image/generate with images should pass them as image_data_urls in param_json."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/img2img.png")

        with patch(
            "app.api.v1.ai_image.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_gen:
            resp = await test_client.post(
                "/api/v1/ai/image/generate",
                headers=headers,
                json={
                    "prompt": "enhance this photo",
                    "images": ["data:image/png;base64,abc123"],
                },
            )

            assert resp.status_code == 200
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["param_json"]["image_data_urls"] == ["data:image/png;base64,abc123"]

    @pytest.mark.asyncio
    async def test_image_route_response_format(
        self, test_client, authenticated_user, db_session,
    ):
        """Response should have {code, msg, data: {url, raw}} format."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/result.png")

        with patch(
            "app.api.v1.ai_image.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = await test_client.post(
                "/api/v1/ai/image/generate",
                headers=headers,
                json={"prompt": "test"},
            )

            body = resp.json()
            assert "code" in body
            assert "msg" in body
            assert "data" in body
            assert "url" in body["data"]
            assert "raw" in body["data"]


# ---------------------------------------------------------------------------
# API Route tests: /ai/video/generate (Requirement 4.2)
# ---------------------------------------------------------------------------

class TestVideoAPIRoute:
    """Verify /ai/video/generate calls generate_media(category='video') and
    returns the expected response format."""

    @pytest.mark.asyncio
    async def test_video_route_calls_generate_media_with_video_category(
        self, test_client, authenticated_user, db_session,
    ):
        """POST /v1/ai/video/generate should call generate_media(category='video')."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/generated.mp4")

        with patch(
            "app.api.v1.ai_video.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_gen:
            resp = await test_client.post(
                "/api/v1/ai/video/generate",
                headers=headers,
                json={
                    "prompt": "a running dog in the park",
                    "duration": 10,
                    "aspect_ratio": "16:9",
                    "binding_key": "video",
                },
            )

            assert resp.status_code == 200
            body = resp.json()
            assert body["code"] == 200
            assert body["data"]["url"] == "https://cdn.example.com/generated.mp4"

            # Verify generate_media was called with category="video"
            mock_gen.assert_called_once()
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["category"] == "video"
            assert call_kwargs["prompt"] == "a running dog in the park"
            assert call_kwargs["param_json"]["duration"] == 10
            assert call_kwargs["param_json"]["aspect_ratio"] == "16:9"

    @pytest.mark.asyncio
    async def test_video_route_passes_images_as_data_urls(
        self, test_client, authenticated_user, db_session,
    ):
        """POST /v1/ai/video/generate with images should pass them as image_data_urls in param_json."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/i2v.mp4")

        with patch(
            "app.api.v1.ai_video.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_gen:
            resp = await test_client.post(
                "/api/v1/ai/video/generate",
                headers=headers,
                json={
                    "prompt": "animate this image",
                    "images": ["data:image/png;base64,xyz789"],
                },
            )

            assert resp.status_code == 200
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["param_json"]["image_data_urls"] == ["data:image/png;base64,xyz789"]

    @pytest.mark.asyncio
    async def test_video_route_default_duration_and_aspect_ratio(
        self, test_client, authenticated_user, db_session,
    ):
        """Video route should use default duration=5 and aspect_ratio='16:9' when not specified."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/default.mp4")

        with patch(
            "app.api.v1.ai_video.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_gen:
            resp = await test_client.post(
                "/api/v1/ai/video/generate",
                headers=headers,
                json={"prompt": "test video"},
            )

            assert resp.status_code == 200
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["param_json"]["duration"] == 5
            assert call_kwargs["param_json"]["aspect_ratio"] == "16:9"

    @pytest.mark.asyncio
    async def test_video_route_response_format(
        self, test_client, authenticated_user, db_session,
    ):
        """Response should have {code, msg, data: {url, raw}} format."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/result.mp4")

        with patch(
            "app.api.v1.ai_video.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = await test_client.post(
                "/api/v1/ai/video/generate",
                headers=headers,
                json={"prompt": "test"},
            )

            body = resp.json()
            assert "code" in body
            assert "msg" in body
            assert "data" in body
            assert "url" in body["data"]
            assert "raw" in body["data"]


# ---------------------------------------------------------------------------
# Backward compatibility (Requirement 4.3)
# ---------------------------------------------------------------------------

class TestBackwardCompatibility:
    """Verify that the migrated API routes maintain backward compatibility
    with the existing request/response format."""

    @pytest.mark.asyncio
    async def test_image_route_accepts_legacy_request_format(
        self, test_client, authenticated_user, db_session,
    ):
        """The image route should accept the legacy format with binding_key, prompt,
        resolution, and images fields."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/legacy.png")

        with patch(
            "app.api.v1.ai_image.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = await test_client.post(
                "/api/v1/ai/image/generate",
                headers=headers,
                json={
                    "binding_key": "image",
                    "prompt": "legacy format test",
                    "resolution": "512x512",
                    "images": [],
                },
            )

            assert resp.status_code == 200
            body = resp.json()
            assert body["code"] == 200
            assert body["msg"] == "OK"
            assert isinstance(body["data"]["url"], str)

    @pytest.mark.asyncio
    async def test_video_route_accepts_legacy_request_format(
        self, test_client, authenticated_user, db_session,
    ):
        """The video route should accept the legacy format with binding_key, prompt,
        duration, aspect_ratio, and images fields."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/legacy.mp4")

        with patch(
            "app.api.v1.ai_video.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = await test_client.post(
                "/api/v1/ai/video/generate",
                headers=headers,
                json={
                    "binding_key": "video",
                    "prompt": "legacy format test",
                    "duration": 5,
                    "aspect_ratio": "16:9",
                    "images": [],
                },
            )

            assert resp.status_code == 200
            body = resp.json()
            assert body["code"] == 200
            assert body["msg"] == "OK"
            assert isinstance(body["data"]["url"], str)

    @pytest.mark.asyncio
    async def test_image_route_minimal_request(
        self, test_client, authenticated_user, db_session,
    ):
        """Image route should work with just a prompt (minimal request)."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/minimal.png")

        with patch(
            "app.api.v1.ai_image.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = await test_client.post(
                "/api/v1/ai/image/generate",
                headers=headers,
                json={"prompt": "just a prompt"},
            )

            assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_video_route_minimal_request(
        self, test_client, authenticated_user, db_session,
    ):
        """Video route should work with just a prompt (minimal request)."""
        headers = authenticated_user["headers"]
        mock_response = _make_media_response("https://cdn.example.com/minimal.mp4")

        with patch(
            "app.api.v1.ai_video.ai_gateway_service.generate_media",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            resp = await test_client.post(
                "/api/v1/ai/video/generate",
                headers=headers,
                json={"prompt": "just a prompt"},
            )

            assert resp.status_code == 200
