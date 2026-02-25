from types import SimpleNamespace
from uuid import UUID, uuid4

import base64
import pytest

from app.ai_gateway import ai_gateway_service
from app.models import FileNode, Project, User
from app.services.storage.vfs_service import vfs_service
from app.tasks.handlers.asset_image_generate import AssetImageGenerateHandler


class _DummyReporter:
    async def progress(self, *, progress: int, payload=None) -> None:
        _ = (progress, payload)

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        _ = (message, level, payload)


@pytest.mark.asyncio(loop_scope="function")
async def test_asset_image_generate_replaces_extension_for_mime(db_session, monkeypatch):
    user_id = uuid4()
    db_session.add(
        User(
            id=user_id,
            email="asset-image@example.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
    )
    project_id = uuid4()
    db_session.add(Project(id=project_id, owner_id=user_id, name="p"))
    await db_session.commit()

    folder = await vfs_service.create_folder(
        db=db_session,
        user_id=user_id,
        name="assets",
        parent_id=None,
        workspace_id=None,
        project_id=project_id,
    )

    from app.schemas_media import MediaResponse

    async def _fake_generate_media(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, negative_prompt=None, callback_url=None):
        _ = (db, user_id, binding_key, model_config_id, prompt, param_json, category)
        payload = base64.b64encode(b"hello").decode("ascii")
        return MediaResponse(url=f"data:image/jpeg;base64,{payload}", usage_id="", meta={})

    monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate_media)

    handler = AssetImageGenerateHandler()
    task = SimpleNamespace(
        user_id=user_id,
        input_json={
            "project_id": str(project_id),
            "parent_node_id": str(folder.id),
            "filename": "generated.png",
            "prompt": "test prompt",
        },
    )
    out = await handler.run(db=db_session, task=task, reporter=_DummyReporter())
    node_id = UUID(out["file_node_id"])
    node = await db_session.get(FileNode, node_id)
    assert node is not None
    assert node.name == "generated.jpg"
    assert node.content_type == "image/jpeg"
