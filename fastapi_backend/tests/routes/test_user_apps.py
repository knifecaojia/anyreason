import pytest


@pytest.mark.asyncio
async def test_user_apps_crud_and_run(test_client, authenticated_user):
    headers = authenticated_user["headers"]

    flow = {"nodes": [{"id": "n1", "type": "scene", "scene_code": "script_split"}], "edges": []}

    resp = await test_client.post(
        "/api/v1/user-apps",
        headers=headers,
        json={
            "name": "App1",
            "description": "D",
            "icon": None,
            "flow_definition": flow,
            "trigger_type": "manual",
            "input_template": {},
            "output_template": {},
            "is_active": True,
        },
    )
    assert resp.status_code == 200
    app = resp.json()["data"]
    app_id = app["id"]

    resp = await test_client.get("/api/v1/user-apps", headers=headers)
    assert resp.status_code == 200
    assert any(a["id"] == app_id for a in resp.json()["data"])

    resp = await test_client.post(
        f"/api/v1/user-apps/{app_id}/run",
        headers=headers,
        json={"input_data": {"script_text": "x"}},
    )
    assert resp.status_code == 200
    task = resp.json()["data"]
    assert task["type"] == "user_app_run"
    assert task["entity_type"] == "user_app"
    assert task["entity_id"] == app_id

    resp = await test_client.delete(f"/api/v1/user-apps/{app_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True

