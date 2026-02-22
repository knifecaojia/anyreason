import pytest
from uuid import uuid4

from app.models import Asset, FileNode, Project, Script


@pytest.mark.asyncio
async def test_create_asset_resources_binds_file_nodes(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]
    project_id = uuid4()
    script = Script(
        id=project_id,
        owner_id=user.id,
        title="测试剧本",
        description=None,
        aspect_ratio=None,
        animation_style=None,
        minio_bucket="test-bucket",
        minio_key="scripts/test.txt",
        original_filename="test.txt",
        content_type="text/plain",
        size_bytes=1,
    )
    project = Project(
        id=project_id,
        owner_id=user.id,
        name="测试项目",
    )
    asset = Asset(
        project_id=project_id,
        asset_id="A-001",
        name="测试资产",
        type="character",
    )
    node_id = uuid4()
    file_node = FileNode(
        id=node_id,
        name="generated.png",
        is_folder=False,
        project_id=project_id,
        created_by=user.id,
        minio_bucket="test-bucket",
        minio_key="vfs/test/generated.png",
        content_type="image/png",
        size_bytes=10,
    )
    db_session.add_all([script, project, asset, file_node])
    await db_session.commit()

    res = await test_client.post(
        f"/api/v1/assets/{asset.id}/resources",
        headers=authenticated_user["headers"],
        json={"file_node_ids": [str(node_id)], "res_type": "image"},
    )

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["id"] == str(asset.id)
    assert len(data["resources"]) == 1
    assert data["resources"][0]["meta_data"]["file_node_id"] == str(node_id)
    assert data["resources"][0]["res_type"] == "image"
    assert any(v["is_default"] for v in data["variants"])
