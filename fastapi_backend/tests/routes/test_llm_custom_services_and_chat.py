import httpx

from app.config import settings
from app.llm.litellm_client import LiteLLMClient
from app.models import LLMVirtualKey
from app.services.llm_key_service import llm_key_service
import app.services.llm_chat_service as llm_chat_service_module


async def test_admin_create_custom_service(test_client, authenticated_superuser, monkeypatch):
    monkeypatch.setattr(settings, "LITELLM_MASTER_KEY", "sk-test-master")
    monkeypatch.setattr(settings, "LITELLM_BASE_URL", "http://litellm")

    async def fake_add_model(self, *, model_name, litellm_params, model_info=None):
        return {"model_name": model_name, "litellm_params": litellm_params, "model_info": model_info}

    monkeypatch.setattr(LiteLLMClient, "add_model", fake_add_model)

    resp = await test_client.post(
        "/api/v1/llm/admin/custom-services",
        headers=authenticated_superuser["headers"],
        json={
            "name": "My Custom Service",
            "base_url": "http://example.internal",
            "api_key": "sk-custom",
            "models": ["m1", "m2"],
            "enabled": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["name"] == "My Custom Service"
    assert data["base_url"].endswith("/v1")
    assert data["supported_models"] == ["m1", "m2"]
    assert data["created_models"] == ["my-custom-service-m1", "my-custom-service-m2"]


async def test_chat_completions_with_attachment(test_client, authenticated_superuser, db_session, monkeypatch):
    monkeypatch.setattr(settings, "LITELLM_MASTER_KEY", "sk-test-master")
    monkeypatch.setattr(settings, "LITELLM_BASE_URL", "http://litellm")

    token = "sk-user-1"
    encrypted_token = llm_key_service._get_fernet().encrypt(token.encode("utf-8"))
    row = LLMVirtualKey(
        user_id=authenticated_superuser["user"].id,
        purpose="chatbox",
        key_prefix=token[:12],
        key_hash="x" * 64,
        encrypted_token=encrypted_token,
        status="active",
    )
    db_session.add(row)
    await db_session.commit()

    class DummyResp:
        def __init__(self, payload):
            self._payload = payload
            self.status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers=None, json=None):
            assert str(url).endswith("/v1/chat/completions")
            assert headers and headers.get("Authorization") == f"Bearer {token}"
            assert json and json.get("model") == "mock"
            return DummyResp({"choices": [{"message": {"content": "pong"}}]})

    monkeypatch.setattr(llm_chat_service_module.httpx, "AsyncClient", lambda *args, **kwargs: FakeAsyncClient())

    resp = await test_client.post(
        "/api/v1/llm/chat",
        headers=authenticated_superuser["headers"],
        json={
            "model": "mock",
            "messages": [{"role": "user", "content": "ping"}],
            "attachments": [{"kind": "text", "name": "a.txt", "text": "hello"}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["output_text"] == "pong"


async def test_chat_completions_rate_limited(test_client, authenticated_superuser, db_session, monkeypatch):
    monkeypatch.setattr(settings, "LITELLM_MASTER_KEY", "sk-test-master")
    monkeypatch.setattr(settings, "LITELLM_BASE_URL", "http://litellm")

    token = "sk-user-1"
    encrypted_token = llm_key_service._get_fernet().encrypt(token.encode("utf-8"))
    row = LLMVirtualKey(
        user_id=authenticated_superuser["user"].id,
        purpose="chatbox",
        key_prefix=token[:12],
        key_hash="x" * 64,
        encrypted_token=encrypted_token,
        status="active",
    )
    db_session.add(row)
    await db_session.commit()

    class FakeAsyncClient429:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers=None, json=None):
            request = httpx.Request("POST", str(url))
            response = httpx.Response(429, headers={"Retry-After": "2"}, text="rate limited", request=request)
            raise httpx.HTTPStatusError("429", request=request, response=response)

    monkeypatch.setattr(llm_chat_service_module.httpx, "AsyncClient", lambda *args, **kwargs: FakeAsyncClient429())

    resp = await test_client.post(
        "/api/v1/llm/chat",
        headers=authenticated_superuser["headers"],
        json={"model": "mock", "messages": [{"role": "user", "content": "ping"}], "attachments": []},
    )
    assert resp.status_code == 429
    body = resp.json()
    assert body["code"] == 429
