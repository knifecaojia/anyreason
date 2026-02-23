import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.ai_gateway.providers.media.volcengine import VolcengineMediaProvider
from app.ai_gateway.providers.media.aliyun import AliyunMediaProvider
from app.ai_gateway.providers.media.vidu import ViduMediaProvider
from app.ai_gateway.providers.media.gemini import GeminiMediaProvider
from app.schemas_media import MediaRequest

@pytest.mark.asyncio
async def test_volcengine_provider():
    provider = VolcengineMediaProvider(api_key="test_key")
    
    # httpx.Response is synchronous for .json(), .text, .status_code
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": [{"url": "http://example.com/image.png"}],
        "created": "123456"
    }
    
    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        
        # AsyncMock.post() returns a coroutine that resolves to return_value
        mock_client_instance.post.return_value = mock_resp
        
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
        
        req = MediaRequest(model_key="wan2.6", prompt="test")
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
async def test_gemini_provider():
    # Mock MinIO and Config
    with patch("app.ai_gateway.providers.media.gemini.get_minio_client") as mock_get_minio:
        mock_minio = MagicMock()
        mock_get_minio.return_value = mock_minio
        
        provider = GeminiMediaProvider(api_key="test_key")
        
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [{
                "content": {
                    "parts": [{
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": "AAAA" # Base64 for 3 bytes
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
            mock_minio.put_object.assert_called_once()
