import pytest


@pytest.mark.asyncio
async def test_episode_doc_get_creates_and_put_is_idempotent(test_client, authenticated_user):
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
    ep1_id = res.json()["data"]["episodes"][0]["id"]

    res = await test_client.get(
        f"/api/v1/episodes/{ep1_id}/doc",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    doc1 = res.json()["data"]
    assert doc1["node_id"]
    assert doc1["content_md"]
    node_id_1 = doc1["node_id"]

    res = await test_client.put(
        f"/api/v1/episodes/{ep1_id}/doc",
        headers=authenticated_user["headers"],
        json={"content_md": "# EP001 开场\n\n新内容\n"},
    )
    assert res.status_code == 200
    doc2 = res.json()["data"]
    assert doc2["node_id"] == node_id_1
    assert "新内容" in doc2["content_md"]

    res = await test_client.get(
        f"/api/v1/episodes/{ep1_id}/doc",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    doc3 = res.json()["data"]
    assert doc3["node_id"] == node_id_1
    assert "新内容" in doc3["content_md"]
