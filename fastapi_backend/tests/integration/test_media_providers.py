import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.ai_gateway.providers.media.volcengine import VolcengineMediaProvider
from app.ai_gateway.providers.media.aliyun import AliyunMediaProvider
from app.ai_gateway.providers.media.vidu import ViduMediaProvider
from app.ai_gateway.providers.media.gemini import GeminiMediaProvider
from app.ai_gateway.providers.media.gemini_proxy import GeminiProxyProvider
from app.schemas_media import MediaRequest
from app.core.exceptions import AppError


@pytest.mark.asyncio
async def test_volcengine_provider():
    """VolcengineMediaProvider 使用 AsyncArk SDK，需要 mock AsyncArk.images.generate"""
    mock_image_data = MagicMock()
    mock_image_data.url = "http://example.com/image.png"
    mock_image_data.b64_json = None

    mock_response = MagicMock()
    mock_response.data = [mock_image_data]
    mock_response.created = "123456"
    mock_response.to_dict.return_value = {"data": [{"url": "http://example.com/image.png"}]}

    with patch("app.ai_gateway.providers.media.volcengine.AsyncArk") as MockArk:
        mock_ark_instance = MagicMock()
        mock_ark_instance.images = MagicMock()
        mock_ark_instance.images.generate = AsyncMock(return_value=mock_response)
        MockArk.return_value = mock_ark_instance

        provider = VolcengineMediaProvider(api_key="test_key")
        req = MediaRequest(model_key="doubao-pro", prompt="test", param_json={"size": "2K"})
        res = await provider.generate(req)

        assert res.url == "http://example.com/image.png"
        assert res.usage_id == "123456"


@pytest.mark.asyncio
async def test_aliyun_provider():
    provider = AliyunMediaProvider(api_key="test_key")

    # Mock Submit Response
    mock_submit_resp = MagicMock()
    mock_submit_resp.status_code = 200
    mock_submit_resp.json.return_value = {
        "output": {"task_id": "task_123"}
    }

    # Mock Poll Response
    mock_poll_resp = MagicMock()
    mock_poll_resp.status_code = 200
    mock_poll_resp.json.return_value = {
        "output": {
            "task_status": "SUCCEEDED",
            "results": [{"url": "http://example.com/aliyun.png"}]
        }
    }

    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance

        mock_client_instance.post.return_value = mock_submit_resp
        mock_client_instance.get.return_value = mock_poll_resp

        req = MediaRequest(model_key="qwen-image-max", prompt="test")
        res = await provider.generate(req)

        assert res.url == "http://example.com/aliyun.png"
        assert res.usage_id == "task_123"


@pytest.mark.asyncio
async def test_vidu_provider():
    provider = ViduMediaProvider(api_key="test_key")

    mock_submit_resp = MagicMock()
    mock_submit_resp.status_code = 200
    mock_submit_resp.json.return_value = {"task_id": "vidu_task_1"}

    mock_poll_resp = MagicMock()
    mock_poll_resp.status_code = 200
    mock_poll_resp.json.return_value = {
        "state": "success",
        "creations": [{"url": "http://example.com/video.mp4"}]
    }

    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance

        mock_client_instance.post.return_value = mock_submit_resp
        mock_client_instance.get.return_value = mock_poll_resp

        req = MediaRequest(model_key="vidu-pro", prompt="test", param_json={"duration": 5})
        res = await provider.generate(req)

        assert res.url == "http://example.com/video.mp4"
        assert res.usage_id == "vidu_task_1"


@pytest.mark.asyncio
async def test_vidu_provider_failure_extracts_richer_error_message():
    provider = ViduMediaProvider(api_key="test_key")

    mock_submit_resp = MagicMock()
    mock_submit_resp.status_code = 200
    mock_submit_resp.json.return_value = {"task_id": "vidu_task_2"}

    mock_poll_resp = MagicMock()
    mock_poll_resp.status_code = 200
    mock_poll_resp.json.return_value = {
        "state": "failed",
        "code": "CONTENT_POLICY_BLOCKED",
        "msg": "Prompt violates policy",
        "detail": "Contains disallowed violent content",
    }

    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance

        mock_client_instance.post.return_value = mock_submit_resp
        mock_client_instance.get.return_value = mock_poll_resp

        req = MediaRequest(model_key="vidu-pro", prompt="test", param_json={"duration": 5})
        with pytest.raises(AppError) as exc_info:
            await provider.generate(req)

    assert "CONTENT_POLICY_BLOCKED" in exc_info.value.msg or "Prompt violates policy" in exc_info.value.msg
    assert "unknown" not in exc_info.value.msg


@pytest.mark.asyncio
async def test_gemini_provider():
    with patch("app.ai_gateway.providers.media.gemini.get_storage_provider") as mock_get_storage:
        mock_storage = MagicMock()
        mock_storage.put_bytes.return_value = None
        mock_storage.build_url.return_value = "http://localhost/vfs/generated/gemini/test-image.png"
        mock_get_storage.return_value = mock_storage

        provider = GeminiMediaProvider(api_key="test_key")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [{
                "content": {
                    "parts": [{
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": "AAAA"
                        }
                    }]
                }
            }]
        }

        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = AsyncMock()
            MockClient.return_value.__aenter__.return_value = mock_client_instance
            mock_client_instance.post.return_value = mock_resp

            req = MediaRequest(model_key="gemini-pro", prompt="test")
            res = await provider.generate(req)

            assert "generated/gemini/" in res.url
            mock_storage.put_bytes.assert_called_once()


@pytest.mark.asyncio
async def test_gemini_proxy_openai_compat_non_json_response_surfaces_diagnostics():
    provider = GeminiProxyProvider(api_key="test_key", base_url="https://proxy.example.com")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "<html>bad gateway</html>"
    mock_resp.headers = {"content-type": "text/html; charset=utf-8", "x-request-id": "req-123"}
    mock_resp.json.side_effect = ValueError("Expecting value: line 1 column 1 (char 0)")

    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        mock_client_instance.post.return_value = mock_resp

        req = MediaRequest(model_key="gemini-2.0-flash-exp-image-generation", prompt="test prompt")
        with pytest.raises(AppError) as exc_info:
            await provider.generate(req)

    assert exc_info.value.status_code == 502
    assert "non-json response" in exc_info.value.msg.lower()
    assert exc_info.value.data["failure_stage"] == "json_decode"
    assert exc_info.value.data["status_code"] == 200
    assert exc_info.value.data["content_type"] == "text/html; charset=utf-8"
    assert exc_info.value.data["request_url"] == "https://proxy.example.com/v1/chat/completions"
    assert exc_info.value.data["body_preview"] == "<html>bad gateway</html>"


@pytest.mark.asyncio
async def test_gemini_proxy_openai_compat_sse_error_stream_surfaces_upstream_message():
    provider = GeminiProxyProvider(api_key="test_key", base_url="https://new.12ai.org")

    sse_body = (
        'data: {"error":{"message":"Image rate limit exceeded","type":"server_error","code":"upstream_error"}}\n\n'
        'data: {"id":"","object":"chat.completion.chunk","choices":[]}\n\n'
        'data: [DONE]\n\n'
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = sse_body
    mock_resp.headers = {"content-type": "text/event-stream"}
    mock_resp.json.side_effect = ValueError("Expecting value: line 1 column 1 (char 0)")

    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        mock_client_instance.post.return_value = mock_resp

        req = MediaRequest(model_key="gemini-2.0-flash-exp-image-generation", prompt="test prompt")
        with pytest.raises(AppError) as exc_info:
            await provider.generate(req)

    assert exc_info.value.status_code == 502
    assert "image rate limit exceeded" in exc_info.value.msg.lower()
    assert exc_info.value.data["failure_stage"] == "sse_error"
    assert exc_info.value.data["content_type"] == "text/event-stream"
    assert exc_info.value.data["request_url"] == "https://new.12ai.org/v1/chat/completions"
