from __future__ import annotations

from uuid import uuid4

import pytest

from app.ai_gateway.service import ai_gateway_service
from app.ai_gateway.types import ResolvedModelConfig
from app.schemas_media import MediaResponse
from app.models import AIManufacturer, AIModelConfig, User


@pytest.mark.asyncio
async def test_admin_model_config_crud_persists_provider(test_client, authenticated_superuser):
    create_res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "image",
            "manufacturer": "12ai",
            "provider": "twelveai_media",
            "model": "nanobanana",
            "base_url": "https://cdn.12ai.org",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        },
    )

    assert create_res.status_code == 200
    created = create_res.json()["data"]
    assert created["provider"] == "twelveai_media"

    model_config_id = created["id"]
    update_res = await test_client.put(
        f"/api/v1/ai/admin/model-configs/{model_config_id}",
        headers=authenticated_superuser["headers"],
        json={"provider": "openai_image"},
    )

    assert update_res.status_code == 200
    updated = update_res.json()["data"]
    assert updated["provider"] == "openai_image"

    list_res = await test_client.get(
        "/api/v1/ai/admin/model-configs?category=image",
        headers=authenticated_superuser["headers"],
    )
    assert list_res.status_code == 200
    rows = list_res.json()["data"] or []
    row = next(item for item in rows if item["id"] == model_config_id)
    assert row["provider"] == "openai_image"


@pytest.mark.asyncio
async def test_generate_media_prefers_model_provider_over_manufacturer_provider_class(db_session, monkeypatch):
    manufacturer = AIManufacturer(
        id=uuid4(),
        code="12ai",
        name="12AI",
        category="image",
        provider_class="OpenAIImageProvider",
        default_base_url="https://cdn.12ai.org",
        enabled=True,
        sort_order=0,
    )
    db_session.add(manufacturer)
    cfg_id = uuid4()
    cfg = AIModelConfig(
        id=cfg_id,
        category="image",
        manufacturer="12ai",
        provider="twelveai_media",
        model="nanobanana",
        base_url="https://cdn.12ai.org",
        plaintext_api_key="test-key",
        enabled=True,
        sort_order=0,
    )
    db_session.add(cfg)
    await db_session.commit()

    captured: dict[str, str | None] = {}

    class _Provider:
        async def generate(self, request):
            return MediaResponse(url="https://example.com/result.png", duration=None, cost=None, usage_id="test-usage", meta={"model": request.model_key})

    def _fake_get_provider(*, manufacturer, api_key, base_url=None, provider_class=None):
        captured["manufacturer"] = manufacturer
        captured["provider_class"] = provider_class
        captured["base_url"] = base_url
        return _Provider()

    monkeypatch.setattr("app.ai_gateway.service.media_provider_factory.get_provider", _fake_get_provider)
    monkeypatch.setattr("app.ai_gateway.service.credit_price_service.get_model_cost", lambda _cfg: 0)
    async def _fake_release_key(*args, **kwargs):
        return None
    monkeypatch.setattr("app.ai_gateway.concurrency.concurrency_manager.release_key", _fake_release_key)
    async def _fake_resolve_model_config(**kwargs):
        return (
            ResolvedModelConfig(
                category="image",
                manufacturer="12ai",
                provider="twelveai_media",
                model="nanobanana",
                base_url="https://cdn.12ai.org",
                api_key="test-key",
                config_id=cfg_id,
            ),
            cfg_id,
            "image",
            None,
        )
    monkeypatch.setattr(ai_gateway_service, "_resolve_model_config", _fake_resolve_model_config)

    user = User(id=uuid4(), email="provider-test@example.com", hashed_password="x", is_active=True, is_superuser=False, is_verified=True)
    db_session.add(user)
    await db_session.commit()

    response = await ai_gateway_service.generate_media(
        db=db_session,
        user_id=user.id,
        binding_key=None,
        model_config_id=cfg_id,
        prompt="a banana in space",
        category="image",
    )

    assert response.url == "https://example.com/result.png"
    assert captured["manufacturer"] == "twelveai_media"
    assert captured["provider_class"] == "twelveai_media"
