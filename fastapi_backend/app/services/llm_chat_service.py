from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.services.llm_key_service import llm_key_service


class LLMChatService:
    async def chat(
        self,
        *,
        db: AsyncSession,
        user_id,
        model: str,
        messages: list[dict[str, Any]],
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        base_url = settings.LITELLM_BASE_URL.rstrip("/")
        if base_url.endswith("/v1"):
            url = f"{base_url}/chat/completions"
        else:
            url = f"{base_url}/v1/chat/completions"

        merged_messages = list(messages)
        if attachments:
            text_parts: list[str] = []
            image_urls: list[str] = []
            for a in attachments:
                kind = a.get("kind")
                if kind == "text":
                    t = (a.get("text") or "").strip()
                    if t:
                        name = (a.get("name") or "").strip()
                        if name:
                            text_parts.append(f"[附件:{name}]\n{t}")
                        else:
                            text_parts.append(t)
                elif kind == "image":
                    u = (a.get("data_url") or "").strip()
                    if u:
                        image_urls.append(u)

            if text_parts or image_urls:
                last_user_idx = None
                for i in range(len(merged_messages) - 1, -1, -1):
                    if merged_messages[i].get("role") == "user":
                        last_user_idx = i
                        break
                if last_user_idx is None:
                    merged_messages.append({"role": "user", "content": ""})
                    last_user_idx = len(merged_messages) - 1

                original_text = str(merged_messages[last_user_idx].get("content") or "")
                combined_text = "\n\n".join([t for t in [original_text, *text_parts] if t.strip()])
                content: list[dict[str, Any]] = []
                if combined_text.strip():
                    content.append({"type": "text", "text": combined_text})
                for u in image_urls:
                    content.append({"type": "image_url", "image_url": {"url": u}})
                merged_messages[last_user_idx] = {"role": "user", "content": content}

        payload = {"model": model, "messages": merged_messages, "stream": False}

        async def _send(token: str) -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()

        token = await llm_key_service.get_or_issue_user_token(
            db=db,
            user_id=user_id,
            purpose="chatbox",
        )

        try:
            return await _send(token)
        except httpx.HTTPStatusError as e:
            if e.response is not None and e.response.status_code == 429:
                retry_after = e.response.headers.get("Retry-After")
                raise AppError(
                    msg="Rate limited by upstream",
                    code=429,
                    status_code=429,
                    data={"retry_after": retry_after, "detail": (e.response.text or "")[:500]},
                )
            if e.response is not None and e.response.status_code == 401:
                new_token, _ = await llm_key_service.rotate_my_key(
                    db=db,
                    user_id=user_id,
                    purpose="chatbox",
                )
                try:
                    return await _send(new_token)
                except httpx.HTTPError as e2:
                    raise AppError(msg="LiteLLM chat failed", code=502, status_code=502, data=str(e2))
            raise AppError(msg="LiteLLM chat failed", code=502, status_code=502, data=str(e))
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM chat failed", code=502, status_code=502, data=str(e))


llm_chat_service = LLMChatService()
