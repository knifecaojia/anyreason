import pytest


@pytest.mark.asyncio
async def test_episodes_create_after_and_delete_renumbers(test_client, authenticated_user):
    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={
            "title": (None, "测试剧本"),
            "text": (None, "\n".join(["第1集：开场", "内容A", "第2集：继续", "内容B"])),
        },
    )
    assert res.status_code == 200
    script_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/scripts/{script_id}/structure",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/hierarchy",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    episodes = res.json()["data"]["episodes"]
    assert [e["episode_code"] for e in episodes] == ["EP001", "EP002"]
    ep1_id = episodes[0]["id"]

    res = await test_client.post(
        f"/api/v1/scripts/{script_id}/episodes",
        headers=authenticated_user["headers"],
        json={"after_episode_id": ep1_id, "title": "插入集"},
    )
    assert res.status_code == 200
    created = res.json()["data"]
    assert created["episode_code"] == "EP002"
    assert created["episode_number"] == 2

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/hierarchy",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    codes = [e["episode_code"] for e in res.json()["data"]["episodes"]]
    assert codes == ["EP001", "EP002", "EP003"]

    res = await test_client.delete(
        f"/api/v1/episodes/{created['id']}",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    assert res.json()["data"]["deleted"] is True

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/hierarchy",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    codes = [e["episode_code"] for e in res.json()["data"]["episodes"]]
    assert codes == ["EP001", "EP002"]

