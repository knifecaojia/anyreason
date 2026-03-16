from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_gateway.service import ai_gateway_service
from app.ai_gateway.providers.media.vidu import ViduMediaProvider
from app.schemas_media import ExternalTaskRef


@pytest.mark.asyncio
async def test_vidu_provider_cancel_task_reports_unsupported():
    provider = ViduMediaProvider(api_key="test_key")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {}

    with patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        mock_client_instance.post.return_value = mock_resp

        result = await provider.cancel_task("vidu-task-1")

    mock_client_instance.post.assert_awaited_once()
    _, kwargs = mock_client_instance.post.await_args
    assert kwargs["headers"]["Authorization"] == "Token test_key"
    assert kwargs["headers"]["Content-Type"] == "application/json"
    assert kwargs["timeout"] == 15.0

    assert result == {
        "attempted": True,
        "supported": True,
        "message": "canceled",
    }


@pytest.mark.asyncio
async def test_ai_gateway_cancel_media_task_delegates_to_provider(monkeypatch):
    provider = AsyncMock()
    provider.cancel_task.return_value = {
        "attempted": True,
        "supported": True,
        "message": "canceled",
    }

    monkeypatch.setattr(
        "app.ai_gateway.service.media_provider_factory.get_provider",
        lambda manufacturer, api_key, base_url=None: provider,
    )

    ref = ExternalTaskRef(
        external_task_id="external-1",
        provider="vidu",
        meta={"api_key": "abc", "base_url": "https://api.example.com"},
    )

    result = await ai_gateway_service.cancel_media_task(ref=ref)

    provider.cancel_task.assert_awaited_once_with("external-1")
    assert result == {
        "attempted": True,
        "supported": True,
        "message": "canceled",
    }
