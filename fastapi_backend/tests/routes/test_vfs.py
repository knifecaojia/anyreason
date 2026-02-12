import pytest


@pytest.mark.asyncio
async def test_vfs_create_list_download_and_recursive_delete(test_client, authenticated_user):
    res = await test_client.post(
        "/api/v1/vfs/folders",
        headers=authenticated_user["headers"],
        json={"name": "root", "project_id": None, "workspace_id": None, "parent_id": None},
    )
    assert res.status_code == 200
    root_id = res.json()["data"]["id"]

    res = await test_client.post(
        "/api/v1/vfs/files",
        headers=authenticated_user["headers"],
        json={"name": "a.md", "content": "# Hello", "parent_id": root_id},
    )
    assert res.status_code == 200
    file_id = res.json()["data"]["id"]

    res = await test_client.get(
        "/api/v1/vfs/nodes",
        headers=authenticated_user["headers"],
        params={"parent_id": root_id},
    )
    assert res.status_code == 200
    nodes = res.json()["data"]
    assert len(nodes) == 1
    assert nodes[0]["id"] == file_id

    res = await test_client.get(
        f"/api/v1/vfs/nodes/{file_id}/download",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    assert res.content == b"# Hello"

    res = await test_client.delete(
        f"/api/v1/vfs/nodes/{root_id}",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 400

    res = await test_client.delete(
        f"/api/v1/vfs/nodes/{root_id}",
        headers=authenticated_user["headers"],
        params={"recursive": "true"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["deleted"] is True

