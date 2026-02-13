import json

import pytest

from app.ai_gateway import ai_gateway_service
from app.models import BuiltinAgent, BuiltinAgentPromptVersion, User
from app.services.agent_platform_seed_service import seed_agent_platform_assets


@pytest.mark.asyncio
async def test_list_scenes(test_client, db_session, authenticated_user):
    await seed_agent_platform_assets(session=db_session)
    await db_session.commit()

    resp = await test_client.get("/api/v1/scenes", headers=authenticated_user["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert isinstance(body["data"], list)
    assert any(s["scene_code"] == "script_split" for s in body["data"])


@pytest.mark.asyncio
async def test_run_script_split_scene(test_client, db_session, authenticated_user, monkeypatch):
    user: User = authenticated_user["user"]

    agent = BuiltinAgent(agent_code="episode_expert", name="分集专家", category="episode")
    db_session.add(agent)
    await db_session.flush()

    db_session.add(
        BuiltinAgentPromptVersion(
            builtin_agent_id=agent.id,
            version=1,
            system_prompt="seed",
            is_default=True,
            created_by=user.id,
            meta={},
        )
    )
    await db_session.commit()

    async def fake_chat_text(**_kwargs):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "episodes": [
                                    {
                                        "episode_number": 1,
                                        "title": "EP1",
                                        "summary": "S",
                                        "scenes": [{"scene_number": 1, "summary": "SC1"}],
                                    }
                                ]
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ]
        }

    monkeypatch.setattr(ai_gateway_service, "chat_text", fake_chat_text)

    resp = await test_client.post(
        "/api/v1/scenes/script_split/run",
        headers=authenticated_user["headers"],
        json={"script_text": "测试"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"]["episodes"][0]["episode_number"] == 1

