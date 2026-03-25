from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_gateway.providers.media.twelveai import TwelveAIMediaProvider
from app.core.exceptions import AppError
from app.schemas_media import ExternalTaskRef, MediaRequest


@pytest.mark.asyncio
async def test_twelveai_image_sync_generation_success():
    """Test sync image generation using Gemini API endpoint."""
    provider = TwelveAIMediaProvider(api_key="test_key")

    # Mock response for Gemini sync API
    sync_resp = MagicMock()
    sync_resp.raise_for_status.return_value = None
    sync_resp.json.return_value = {
        "candidates": [{
            "content": {
                "parts": [{
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                    }
                }]
            },
            "finishReason": "STOP"
        }],
        "usageMetadata": {
            "promptTokenCount": 10,
            "candidatesTokenCount": 1290,
            "totalTokenCount": 1300
        }
    }

    with patch("httpx.AsyncClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value.__aenter__.return_value = client
        client.post.return_value = sync_resp

        result = await provider.generate(MediaRequest(model_key="gemini-3-pro-image-preview", prompt="draw a banana"))

    # Verify the result is a data URL
    assert result.url.startswith("data:image/png;base64,")
    assert "iVBORw0KGgo" in result.url
    assert result.duration is None
    assert result.meta is not None


@pytest.mark.asyncio
async def test_twelveai_video_submit_and_poll_success():
    """Test async video generation using polling."""
    provider = TwelveAIMediaProvider(api_key="test_key")

    submit_resp = MagicMock()
    submit_resp.raise_for_status.return_value = None
    submit_resp.json.return_value = {"id": "vid-123"}

    poll_resp = MagicMock()
    poll_resp.raise_for_status.return_value = None
    poll_resp.json.return_value = {"status": "completed", "progress": 100}

    with patch("httpx.AsyncClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value.__aenter__.return_value = client
        client.post.return_value = submit_resp
        client.get.return_value = poll_resp

        ref = await provider.submit_async(
            MediaRequest(model_key="veo-3.1", prompt="cinematic river", param_json={"duration": 10})
        )
        status = await provider.query_status(ref)

    assert ref.external_task_id == "vid-123"
    assert ref.meta["kind"] == "video"
    assert status.state == "succeeded"
    assert status.result is not None
    assert status.result.url.endswith("/v1/videos/vid-123/content")


@pytest.mark.asyncio
async def test_twelveai_generate_raises_on_failed_status():
    provider = TwelveAIMediaProvider(api_key="test_key")
    ref = ExternalTaskRef(external_task_id="vid-err", provider="twelveai_media", meta={"kind": "video"})

    with patch.object(provider, "submit_async", AsyncMock(return_value=ref)):
        with patch.object(
            provider,
            "query_status",
            AsyncMock(return_value=type("Status", (), {"state": "failed", "result": None, "error": "rate limited"})()),
        ):
            with pytest.raises(AppError) as exc_info:
                await provider.generate(MediaRequest(model_key="sora-2", prompt="storm over city"))

    assert exc_info.value.msg == "rate limited"


@pytest.mark.asyncio
async def test_twelveai_image_sync_with_aspect_ratio():
    """Test sync image generation with aspect ratio config."""
    provider = TwelveAIMediaProvider(api_key="test_key")

    # Mock response for Gemini sync API
    sync_resp = MagicMock()
    sync_resp.raise_for_status.return_value = None
    sync_resp.json.return_value = {
        "candidates": [{
            "content": {
                "parts": [{
                    "inlineData": {
                        "mimeType": "image/jpeg",
                        "data": "base64imagedata"
                    }
                }]
            },
            "finishReason": "STOP"
        }]
    }

    with patch("httpx.AsyncClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value.__aenter__.return_value = client
        client.post.return_value = sync_resp

        result = await provider.generate(
            MediaRequest(
                model_key="gemini-3.1-flash-image-preview",
                prompt="a cat",
                param_json={"aspect_ratio": "16:9", "imageSize": "2K"}
            )
        )

    # Verify the request was made with correct parameters
    call_args = client.post.call_args
    assert "gemini-3.1-flash-image-preview" in call_args[0][0]
    
    # Check request body
    request_body = call_args[1]["json"]
    assert request_body["contents"][0]["parts"][0]["text"] == "a cat"
    assert "generationConfig" in request_body
    assert request_body["generationConfig"]["responseModalities"] == ["IMAGE"]
    assert request_body["generationConfig"]["imageConfig"]["aspectRatio"] == "16:9"
    assert request_body["generationConfig"]["imageConfig"]["imageSize"] == "2K"


@pytest.mark.asyncio
async def test_twelveai_image_sync_no_image_data_raises_error():
    """Test that missing image data in response raises AppError."""
    provider = TwelveAIMediaProvider(api_key="test_key")

    # Mock response with no image data
    sync_resp = MagicMock()
    sync_resp.raise_for_status.return_value = None
    sync_resp.json.return_value = {
        "candidates": [{
            "content": {
                "parts": [{"text": "I cannot generate that image"}]
            },
            "finishReason": "SAFETY"
        }]
    }

    with patch("httpx.AsyncClient") as MockClient:
        client = AsyncMock()
        MockClient.return_value.__aenter__.return_value = client
        client.post.return_value = sync_resp

        with pytest.raises(AppError) as exc_info:
            await provider.generate(MediaRequest(model_key="gemini-3-pro-image-preview", prompt="draw something"))

    assert "no image data" in exc_info.value.msg.lower() or "generation failed" in exc_info.value.msg.lower()
