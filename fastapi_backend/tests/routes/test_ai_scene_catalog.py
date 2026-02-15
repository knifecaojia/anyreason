import pytest

from app.models import Scene


@pytest.mark.asyncio
async def test_ai_scene_catalog_requires_auth(test_client):
    res = await test_client.get("/api/v1/ai/scenes")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_ai_scene_catalog_lists_active_scenes(test_client, authenticated_user, db_session):
    db_session.add(
        Scene(
            scene_code="builtin_asset_extract",
            name="资产提取",
            type="builtin",
            description="d",
            required_tools=["preview_extract_characters"],
            input_schema={"type": "object"},
            output_schema={"type": "object"},
            ui_config={"is_active": True},
        )
    )
    db_session.add(
        Scene(
            scene_code="disabled_scene",
            name="Disabled",
            type="builtin",
            description="d",
            required_tools=[],
            input_schema={},
            output_schema={},
            ui_config={"is_active": False},
        )
    )
    await db_session.commit()

    res = await test_client.get("/api/v1/ai/scenes", headers=authenticated_user["headers"])
    assert res.status_code == 200
    payload = res.json()["data"] or []
    codes = [x["scene_code"] for x in payload]
    assert "builtin_asset_extract" in codes
    assert "disabled_scene" not in codes

