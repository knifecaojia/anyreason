from __future__ import annotations

from uuid import uuid4

import pytest

from app.models import AIManufacturer, AIModel


@pytest.mark.asyncio
async def test_ai_catalog_includes_model_capabilities(test_client, db_session):
    manufacturer = AIManufacturer(
        id=uuid4(),
        code="12ai",
        name="12AI Gateway",
        category="video",
        provider_class="twelveai_media",
        default_base_url="https://cdn.12ai.org",
        enabled=True,
        sort_order=0,
    )
    db_session.add(manufacturer)
    db_session.add(
        AIModel(
            manufacturer_id=manufacturer.id,
            code="veo-3.1",
            name="Veo 3.1",
            category="video",
            response_format="schema",
            model_capabilities={
                "input_modes": ["text_to_video", "image_to_video"],
                "supports_audio": True,
            },
            enabled=True,
            sort_order=0,
        )
    )
    await db_session.commit()

    res = await test_client.get("/api/v1/ai/catalog?category=video")
    assert res.status_code == 200
    items = res.json()["data"] or []
    row = next(item for item in items if item["manufacturer_code"] == "12ai" and item["model_code"] == "veo-3.1")
    assert row["model_capabilities"]["input_modes"] == ["text_to_video", "image_to_video"]
    assert row["model_capabilities"]["supports_audio"] is True
