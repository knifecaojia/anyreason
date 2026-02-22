import pytest
from uuid import uuid4

from app.models import Asset, AssetBinding, AssetResource, AssetVariant, Episode, FileNode, Project, Script


class _FakeObject:
    def __init__(self, payload: bytes):
        self._payload = payload

    def stream(self, _chunk_size: int):
        yield self._payload

    def read(self):
        return self._payload

    def close(self):
        return None

    def release_conn(self):
        return None


class _FakeMinio:
    def __init__(self):
        self._buckets: set[str] = set()
        self._objects: dict[tuple[str, str], bytes] = {}

    def bucket_exists(self, bucket: str) -> bool:
        return bucket in self._buckets

    def make_bucket(self, bucket: str):
        self._buckets.add(bucket)

    def put_object(self, *, bucket_name: str, object_name: str, data, length: int, content_type: str):
        self._buckets.add(bucket_name)
        self._objects[(bucket_name, object_name)] = data.read(length)

    def get_object(self, bucket: str | None = None, key: str | None = None, *, bucket_name: str | None = None, object_name: str | None = None):
        b = bucket_name or bucket
        k = object_name or key
        return _FakeObject(self._objects[(b, k)])

    def remove_object(self, *, bucket_name: str, object_name: str):
        self._objects.pop((bucket_name, object_name), None)


@pytest.mark.asyncio
async def test_scripts_create_list_download(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "测试剧本"), "text": (None, "第一幕：Hello")},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["code"] == 200
    script_id = payload["data"]["id"]

    res = await test_client.get("/api/v1/scripts?page=1&size=10", headers=authenticated_user["headers"])
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert any(it["id"] == script_id for it in items)

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/download", headers=authenticated_user["headers"]
    )
    assert res.status_code == 200
    assert res.content == "第一幕：Hello".encode("utf-8")
    assert "content-disposition" in res.headers


@pytest.mark.asyncio
async def test_scripts_soft_delete_hides_from_list_and_blocks_download(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "待删除剧本"), "text": (None, "内容")},
    )
    assert res.status_code == 200
    script_id = res.json()["data"]["id"]

    res = await test_client.delete(f"/api/v1/scripts/{script_id}", headers=authenticated_user["headers"])
    assert res.status_code == 200

    res = await test_client.get("/api/v1/scripts?page=1&size=10", headers=authenticated_user["headers"])
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert all(it["id"] != script_id for it in items)

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/download", headers=authenticated_user["headers"]
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_scripts_hierarchy_includes_asset_resources(test_client, authenticated_user, db_session):
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
    episode = Episode(
        project_id=project_id,
        episode_code="EP01",
        episode_number=1,
        title="第一集",
    )
    asset = Asset(
        project_id=project_id,
        asset_id="C_001",
        name="主角A",
        type="character",
    )
    db_session.add_all([script, project, episode, asset])
    await db_session.flush()
    variant = AssetVariant(
        asset=asset,
        variant_code="V1",
        is_default=True,
    )
    binding = AssetBinding(
        episode=episode,
        asset=asset,
        asset_variant=variant,
    )
    node_id = uuid4()
    file_node = FileNode(
        id=node_id,
        name="主角A.png",
        is_folder=False,
        project_id=project_id,
        created_by=user.id,
        minio_bucket="test-bucket",
        minio_key="vfs/test/hero.png",
        content_type="image/png",
        size_bytes=10,
    )
    resource = AssetResource(
        variant=variant,
        res_type="image",
        minio_bucket=file_node.minio_bucket,
        minio_key=file_node.minio_key,
        meta_data={"file_node_id": str(node_id)},
    )
    db_session.add_all([variant, binding, file_node, resource])
    await db_session.commit()

    res = await test_client.get(f"/api/v1/scripts/{project_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    data = res.json()["data"]
    assets = data["episodes"][0]["assets"]
    assert len(assets) == 1
    assert assets[0]["name"] == "主角A"
    assert assets[0]["resources"][0]["meta_data"]["file_node_id"] == str(node_id)
