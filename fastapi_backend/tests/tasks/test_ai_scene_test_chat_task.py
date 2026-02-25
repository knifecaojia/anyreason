import pytest

from app.models import Task
from app.tasks.handlers.ai_scene_test_chat import AiSceneTestChatHandler
from app.tasks.reporter import TaskReporter


@pytest.mark.asyncio(loop_scope="function")
async def test_ai_scene_test_chat_task_handler_ok(db_session, authenticated_user, monkeypatch):
    async def _fake_run_scene_test_chat(*, body, db, user_id, trace_queue=None):
        _ = (body, db, user_id, trace_queue)
        return "ok", [], [{"type": "tool_start", "tool_id": "preview_script_split"}], None

    monkeypatch.setattr("app.tasks.handlers.ai_scene_test_chat.run_scene_test_chat", _fake_run_scene_test_chat)

    t = Task(
        user_id=authenticated_user["user"].id,
        type="ai_scene_test_chat",
        status="queued",
        progress=0,
        input_json={
            "main_agent": {"agent_code": "script_expert", "version": 1},
            "sub_agents": [],
            "tool_ids": [],
            "script_text": "文本",
            "messages": [{"role": "user", "content": "hi"}],
        },
        result_json={},
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)

    reporter = TaskReporter(db=db_session, task=t)
    await reporter.set_running()
    handler = AiSceneTestChatHandler()
    result = await handler.run(db=db_session, task=reporter.task, reporter=reporter)

    assert result["output_text"] == "ok"
    assert isinstance(result["plans"], list)
    assert isinstance(result["trace_events"], list)


@pytest.mark.asyncio(loop_scope="function")
async def test_ai_scene_test_chat_task_handler_validation_error(db_session, authenticated_user):
    t = Task(
        user_id=authenticated_user["user"].id,
        type="ai_scene_test_chat",
        status="queued",
        progress=0,
        input_json={"tool_ids": []},
        result_json={},
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)

    reporter = TaskReporter(db=db_session, task=t)
    await reporter.set_running()
    handler = AiSceneTestChatHandler()
    with pytest.raises(ValueError):
        await handler.run(db=db_session, task=reporter.task, reporter=reporter)
