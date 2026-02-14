import pytest

from app.models import Scene


@pytest.mark.asyncio
async def test_admin_ai_scenes_list_forbidden(test_client, authenticated_user):
    res = await test_client.get("/api/v1/ai/admin/scenes", headers=authenticated_user["headers"])
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_ai_scenes_crud_ok(test_client, authenticated_superuser, db_session):
    db_session.add(
        Scene(
            scene_code="test_scene",
            name="Test Scene",
            type="process",
            description="d",
            required_tools=[],
            input_schema={},
            output_schema={},
            ui_config={},
        )
    )
    await db_session.commit()

    res = await test_client.get("/api/v1/ai/admin/scenes", headers=authenticated_superuser["headers"])
    assert res.status_code == 200
    codes = [x["scene_code"] for x in (res.json()["data"] or [])]
    assert "test_scene" in codes

    res = await test_client.patch(
        "/api/v1/ai/admin/scenes/test_scene",
        headers=authenticated_superuser["headers"],
        json={"name": "Renamed", "description": "x", "ui_config": {"presets": [{"name": "p1"}]}},
    )
    assert res.status_code == 200
    assert res.json()["data"]["name"] == "Renamed"
    assert res.json()["data"]["ui_config"]["presets"][0]["name"] == "p1"

    res = await test_client.delete("/api/v1/ai/admin/scenes/test_scene", headers=authenticated_superuser["headers"])
    assert res.status_code == 200
    assert res.json()["data"]["deleted"] is True

