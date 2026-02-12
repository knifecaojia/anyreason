import pytest
from fastapi import status

from app.tasks.ticket import verify_ws_ticket
from app.config import settings


class TestTasks:
    @pytest.mark.asyncio(loop_scope="function")
    async def test_issue_ws_ticket(self, test_client, authenticated_user):
        res = await test_client.post(
            "/api/v1/tasks/ws-ticket", headers=authenticated_user["headers"]
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()["data"]
        assert isinstance(data["ticket"], str)
        assert data["ticket"]
        assert data["expires_at"]
        user_id = verify_ws_ticket(ticket=data["ticket"], secret=settings.ACCESS_SECRET_KEY)
        assert user_id == authenticated_user["user"].id

    @pytest.mark.asyncio(loop_scope="function")
    async def test_task_crud_and_filters(self, test_client, authenticated_user):
        create_payload = {
            "type": "noop",
            "entity_type": "scene",
            "entity_id": "00000000-0000-0000-0000-000000000001",
            "input_json": {"k": "v"},
        }
        res = await test_client.post(
            "/api/v1/tasks/",
            json=create_payload,
            headers=authenticated_user["headers"],
        )
        assert res.status_code == status.HTTP_200_OK
        task = res.json()["data"]
        assert task["status"] == "queued"
        assert task["type"] == "noop"
        assert task["entity_type"] == "scene"
        assert task["entity_id"] == "00000000-0000-0000-0000-000000000001"

        task_id = task["id"]
        res = await test_client.get(
            f"/api/v1/tasks/{task_id}/events?order=asc&limit=50",
            headers=authenticated_user["headers"],
        )
        assert res.status_code == status.HTTP_200_OK
        event_types = [e["event_type"] for e in res.json()["data"]]
        assert "created" in event_types

        res = await test_client.get(
            f"/api/v1/tasks/{task_id}", headers=authenticated_user["headers"]
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["data"]["id"] == task_id

        res = await test_client.get(
            "/api/v1/tasks/?status=queued&entity_type=scene&entity_id=00000000-0000-0000-0000-000000000001",
            headers=authenticated_user["headers"],
        )
        assert res.status_code == status.HTTP_200_OK
        items = res.json()["data"]["items"]
        assert any(i["id"] == task_id for i in items)

        res = await test_client.post(
            f"/api/v1/tasks/{task_id}/cancel", headers=authenticated_user["headers"]
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["data"]["status"] == "canceled"

        res = await test_client.post(
            f"/api/v1/tasks/{task_id}/retry", headers=authenticated_user["headers"]
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.json()["data"]["status"] == "queued"

        res = await test_client.get(
            f"/api/v1/tasks/{task_id}/events?order=asc&limit=200",
            headers=authenticated_user["headers"],
        )
        assert res.status_code == status.HTTP_200_OK
        event_types = [e["event_type"] for e in res.json()["data"]]
        assert "created" in event_types
        assert "canceled" in event_types
        assert "retried" in event_types

    @pytest.mark.asyncio(loop_scope="function")
    async def test_create_task_strips_type_and_entity_type(self, test_client, authenticated_user):
        create_payload = {
            "type": "  noop  ",
            "entity_type": "  scene  ",
            "entity_id": "00000000-0000-0000-0000-000000000001",
            "input_json": {"k": "v"},
        }
        res = await test_client.post(
            "/api/v1/tasks/",
            json=create_payload,
            headers=authenticated_user["headers"],
        )
        assert res.status_code == status.HTTP_200_OK
        task = res.json()["data"]
        assert task["type"] == "noop"
        assert task["entity_type"] == "scene"
