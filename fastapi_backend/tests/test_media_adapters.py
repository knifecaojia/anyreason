"""Unit tests for media provider adapters and PROVIDER_MAP registration.

Validates:
- Requirements 1.1, 1.2: PROVIDER_MAP contains all expected manufacturer keys
- Requirements 2.1: KlingImageAdapter delegates to KlingImageProvider.generate_image()
- Requirements 2.2: KlingVideoAdapter delegates to KlingVideoProvider.generate_video()
- Requirements 2.3: OpenAIImageAdapter delegates to OpenAIImageProvider.generate_image()
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.ai_gateway.providers.adapters.kling_image_adapter import KlingImageAdapter
from app.ai_gateway.providers.adapters.kling_video_adapter import KlingVideoAdapter
from app.ai_gateway.providers.adapters.openai_image_adapter import OpenAIImageAdapter
from app.ai_gateway.providers.media_factory import MediaProviderFactory
from app.schemas_media import MediaRequest, MediaResponse


# ---------------------------------------------------------------------------
# PROVIDER_MAP completeness (Requirements 1.1, 1.2)
# ---------------------------------------------------------------------------

EXPECTED_IMAGE_KEYS = {
    "aliyun",
    "volcengine",
    "doubao",
    "gemini",
    "google",
    "gemini_proxy",
    "kling",
    "openai",
}

EXPECTED_VIDEO_KEYS = {
    "volcengine_video",
    "vidu",
    "kling_video",
}

ALL_EXPECTED_KEYS = EXPECTED_IMAGE_KEYS | EXPECTED_VIDEO_KEYS


class TestProviderMapCompleteness:
    """Verify PROVIDER_MAP contains all expected manufacturer keys."""

    def test_all_expected_keys_present(self):
        registered = set(MediaProviderFactory.PROVIDER_MAP.keys())
        missing = ALL_EXPECTED_KEYS - registered
        assert not missing, f"Missing keys in PROVIDER_MAP: {missing}"

    def test_image_manufacturer_keys(self):
        registered = set(MediaProviderFactory.PROVIDER_MAP.keys())
        missing = EXPECTED_IMAGE_KEYS - registered
        assert not missing, f"Missing image keys: {missing}"

    def test_video_manufacturer_keys(self):
        registered = set(MediaProviderFactory.PROVIDER_MAP.keys())
        missing = EXPECTED_VIDEO_KEYS - registered
        assert not missing, f"Missing video keys: {missing}"

    def test_no_none_values(self):
        for key, cls in MediaProviderFactory.PROVIDER_MAP.items():
            assert cls is not None, f"PROVIDER_MAP['{key}'] is None"


# ---------------------------------------------------------------------------
# KlingImageAdapter (Requirement 2.1)
# ---------------------------------------------------------------------------

class TestKlingImageAdapter:
    """Verify KlingImageAdapter delegates correctly to KlingImageProvider."""

    @pytest.mark.asyncio
    async def test_delegates_to_generate_image(self):
        adapter = KlingImageAdapter(api_key="test-key", base_url="https://example.com")

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value="https://result.com/image.png",
        ) as mock_gen:
            request = MediaRequest(
                model_key="kling-v1",
                prompt="a cat",
                param_json={"resolution": "1024x1024", "image_data_urls": ["data:image/png;base64,abc"]},
            )
            result = await adapter.generate(request)

            mock_gen.assert_called_once()
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["prompt"] == "a cat"
            assert call_kwargs["resolution"] == "1024x1024"
            assert call_kwargs["image_data_urls"] == ["data:image/png;base64,abc"]
            cfg = call_kwargs["cfg"]
            assert cfg.category == "image"
            assert cfg.manufacturer == "kling"
            assert cfg.model == "kling-v1"
            assert cfg.api_key == "test-key"
            assert cfg.base_url == "https://example.com"

    @pytest.mark.asyncio
    async def test_returns_media_response(self):
        adapter = KlingImageAdapter(api_key="k")

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/img.png",
        ):
            request = MediaRequest(model_key="m", prompt="p", param_json={})
            result = await adapter.generate(request)

            assert isinstance(result, MediaResponse)
            assert result.url == "https://cdn.example.com/img.png"

    @pytest.mark.asyncio
    async def test_missing_optional_params(self):
        adapter = KlingImageAdapter(api_key="k")

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/img.png",
        ) as mock_gen:
            request = MediaRequest(model_key="m", prompt="p", param_json={})
            await adapter.generate(request)

            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["resolution"] is None
            assert call_kwargs["image_data_urls"] is None


# ---------------------------------------------------------------------------
# KlingVideoAdapter (Requirement 2.2)
# ---------------------------------------------------------------------------

class TestKlingVideoAdapter:
    """Verify KlingVideoAdapter delegates correctly to KlingVideoProvider."""

    @pytest.mark.asyncio
    async def test_delegates_to_generate_video(self):
        adapter = KlingVideoAdapter(api_key="test-key", base_url="https://example.com")

        with patch.object(
            adapter._provider,
            "generate_video",
            new_callable=AsyncMock,
            return_value="https://result.com/video.mp4",
        ) as mock_gen:
            request = MediaRequest(
                model_key="kling-video-v1",
                prompt="a running dog",
                param_json={
                    "duration": 10,
                    "aspect_ratio": "9:16",
                    "image_data_urls": ["data:image/png;base64,xyz"],
                },
            )
            result = await adapter.generate(request)

            mock_gen.assert_called_once()
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["prompt"] == "a running dog"
            assert call_kwargs["duration"] == 10
            assert call_kwargs["aspect_ratio"] == "9:16"
            assert call_kwargs["image_data_urls"] == ["data:image/png;base64,xyz"]
            cfg = call_kwargs["cfg"]
            assert cfg.category == "video"
            assert cfg.manufacturer == "kling"
            assert cfg.model == "kling-video-v1"
            assert cfg.api_key == "test-key"

    @pytest.mark.asyncio
    async def test_returns_media_response(self):
        adapter = KlingVideoAdapter(api_key="k")

        with patch.object(
            adapter._provider,
            "generate_video",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/vid.mp4",
        ):
            request = MediaRequest(model_key="m", prompt="p", param_json={})
            result = await adapter.generate(request)

            assert isinstance(result, MediaResponse)
            assert result.url == "https://cdn.example.com/vid.mp4"

    @pytest.mark.asyncio
    async def test_default_duration_and_aspect_ratio(self):
        adapter = KlingVideoAdapter(api_key="k")

        with patch.object(
            adapter._provider,
            "generate_video",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/vid.mp4",
        ) as mock_gen:
            request = MediaRequest(model_key="m", prompt="p", param_json={})
            await adapter.generate(request)

            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["duration"] == 5
            assert call_kwargs["aspect_ratio"] == "16:9"


# ---------------------------------------------------------------------------
# OpenAIImageAdapter (Requirement 2.3)
# ---------------------------------------------------------------------------

class TestOpenAIImageAdapter:
    """Verify OpenAIImageAdapter delegates correctly to OpenAIImageProvider."""

    @pytest.mark.asyncio
    async def test_delegates_to_generate_image(self):
        adapter = OpenAIImageAdapter(api_key="sk-test", base_url="https://api.openai.com")

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value="https://result.com/openai.png",
        ) as mock_gen:
            request = MediaRequest(
                model_key="dall-e-3",
                prompt="sunset over mountains",
                param_json={"resolution": "1792x1024", "image_data_urls": None},
            )
            result = await adapter.generate(request)

            mock_gen.assert_called_once()
            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["prompt"] == "sunset over mountains"
            assert call_kwargs["resolution"] == "1792x1024"
            assert call_kwargs["image_data_urls"] is None
            cfg = call_kwargs["cfg"]
            assert cfg.category == "image"
            assert cfg.manufacturer == "openai"
            assert cfg.model == "dall-e-3"
            assert cfg.api_key == "sk-test"

    @pytest.mark.asyncio
    async def test_returns_media_response(self):
        adapter = OpenAIImageAdapter(api_key="k")

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/oai.png",
        ):
            request = MediaRequest(model_key="m", prompt="p", param_json={})
            result = await adapter.generate(request)

            assert isinstance(result, MediaResponse)
            assert result.url == "https://cdn.example.com/oai.png"

    @pytest.mark.asyncio
    async def test_missing_optional_params(self):
        adapter = OpenAIImageAdapter(api_key="k")

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/oai.png",
        ) as mock_gen:
            request = MediaRequest(model_key="m", prompt="p", param_json={})
            await adapter.generate(request)

            call_kwargs = mock_gen.call_args.kwargs
            assert call_kwargs["resolution"] is None
            assert call_kwargs["image_data_urls"] is None
