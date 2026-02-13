import pytest
from pydantic import BaseModel

from app.models import Task, UserApp, User
from app.tasks.handlers.user_app_run import UserAppRunHandler


class _DummyReporter:
    async def log(self, **_kwargs):
        return None

    async def progress(self, **_kwargs):
        return None


class _DummyOut(BaseModel):
    ok: bool = True


@pytest.mark.asyncio
async def test_user_app_run_handler_executes_flow(db_session, authenticated_user, monkeypatch):
    user: User = authenticated_user["user"]

    app = UserApp(
        user_id=user.id,
        workspace_id=None,
        name="A",
        description=None,
        icon=None,
        flow_definition={"nodes": [{"id": "n1", "type": "scene", "scene_code": "script_split"}], "edges": []},
        trigger_type="manual",
        input_template={},
        output_template={},
        is_active=True,
    )
    db_session.add(app)
    await db_session.flush()

    task = Task(
        user_id=user.id,
        type="user_app_run",
        status="queued",
        progress=0,
        entity_type="user_app",
        entity_id=app.id,
        input_json={"app_id": str(app.id), "input_data": {"script_text": "x"}},
    )
    db_session.add(task)
    await db_session.commit()

    async def fake_run_scene(*, db, user_id, scene_code, payload):
        assert scene_code == "script_split"
        assert payload == {"script_text": "x"}
        return _DummyOut()

    monkeypatch.setattr("app.services.app_runtime_service.run_scene", fake_run_scene)

    handler = UserAppRunHandler()
    result = await handler.run(db=db_session, task=task, reporter=_DummyReporter())
    assert result["state"]["intermediate"]["n1"]["ok"] is True

