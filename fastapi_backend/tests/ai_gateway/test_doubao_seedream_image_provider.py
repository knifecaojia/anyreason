import json

import httpx
import pytest

from app.ai_gateway.types import ResolvedModelConfig


@pytest.mark.asyncio
async def test_seedream_generate_image_single_reference_sends_string_image_and_returns_url(monkeypatch):
    cfg = ResolvedModelConfig(
        category="image",
        manufacturer="doubao",
        model="doubao-seedream-4.5",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key="test-key",
    )

    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["json"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, json={"data": [{"url": "https://example.com/out.png"}]})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.ai_gateway.providers.doubao_seedream_image_provider.httpx_client",
        lambda timeout_seconds=60.0: httpx.AsyncClient(transport=transport),
    )

    from app.ai_gateway.providers.doubao_seedream_image_provider import DoubaoSeedreamImageProvider

    p = DoubaoSeedreamImageProvider()
    out = await p.generate_image(
        cfg=cfg,
        prompt="a cat",
        resolution="2048x2048",
        image_data_urls=["data:image/png;base64,AAAA"],
    )
    assert out == "https://example.com/out.png"
    assert str(captured["url"]).endswith("/images/generations")
    assert "authorization" in {str(k).lower() for k in ((captured["headers"] or {}) if isinstance(captured["headers"], dict) else {})}
    assert (captured["json"] or {}).get("model") == "doubao-seedream-4.5"
    assert (captured["json"] or {}).get("prompt") == "a cat"
    assert (captured["json"] or {}).get("size") == "2048x2048"
    assert (captured["json"] or {}).get("image") == "data:image/png;base64,AAAA"


@pytest.mark.asyncio
async def test_seedream_generate_image_multi_reference_sends_array_image(monkeypatch):
    cfg = ResolvedModelConfig(
        category="image",
        manufacturer="doubao",
        model="doubao-seedream-4.5",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key="test-key",
    )

    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["json"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, json={"data": [{"url": "https://example.com/out.png"}]})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        "app.ai_gateway.providers.doubao_seedream_image_provider.httpx_client",
        lambda timeout_seconds=60.0: httpx.AsyncClient(transport=transport),
    )

    from app.ai_gateway.providers.doubao_seedream_image_provider import DoubaoSeedreamImageProvider

    p = DoubaoSeedreamImageProvider()
    _ = await p.generate_image(
        cfg=cfg,
        prompt="a cat",
        resolution=None,
        image_data_urls=["data:image/png;base64,A", "data:image/png;base64,B"],
    )

    assert (captured["json"] or {}).get("image") == ["data:image/png;base64,A", "data:image/png;base64,B"]
