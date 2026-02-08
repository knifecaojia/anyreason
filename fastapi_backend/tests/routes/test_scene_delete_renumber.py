import pytest


@pytest.mark.asyncio
async def test_delete_scene_triggers_renumber_and_updates_shot_codes(test_client, authenticated_user):
    script_text = "\n".join(["剧本正文", "EPISODE 1: 第一集", "内容A"])
    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "测试剧本"), "text": (None, script_text)},
    )
    assert res.status_code == 200
    script_id = res.json()["data"]["id"]

    res = await test_client.post(f"/api/v1/scripts/{script_id}/structure", headers=authenticated_user["headers"])
    assert res.status_code == 200
    episode_id = res.json()["data"]["episodes"][0]["id"]

    created_scene_ids: list[str] = []
    for i in range(3):
        res = await test_client.post(
            f"/api/v1/episodes/{episode_id}/scenes",
            headers=authenticated_user["headers"],
            json={
                "scene_number": i + 1,
                "title": f"SCENE {i+1}",
                "location": "测试地点",
                "time_of_day": "DAY",
                "location_type": "外",
                "content": f"内容{i+1}",
            },
        )
        assert res.status_code == 200
        created_scene_ids.append(res.json()["data"]["id"])

    scene1_id, scene2_id, scene3_id = created_scene_ids

    res = await test_client.post(
        f"/api/v1/scenes/{scene3_id}/ai/storyboard/apply",
        headers=authenticated_user["headers"],
        json={
            "mode": "replace",
            "shots": [
                {"description": "镜头1", "duration_estimate": 1.0},
                {"description": "镜头2", "duration_estimate": 1.0},
            ],
        },
    )
    assert res.status_code == 200

    res = await test_client.delete(f"/api/v1/scenes/{scene1_id}", headers=authenticated_user["headers"])
    assert res.status_code == 200

    res = await test_client.get(f"/api/v1/scripts/{script_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    scenes = res.json()["data"]["episodes"][0]["scenes"]
    assert [s["scene_number"] for s in scenes] == [1, 2]

    res = await test_client.get(f"/api/v1/scenes/{scene3_id}/shots", headers=authenticated_user["headers"])
    assert res.status_code == 200
    shots = res.json()["data"]
    assert [s["shot_number"] for s in shots] == [1, 2]
    assert all("_SC02_" in s["shot_code"] for s in shots)

