from __future__ import annotations

from typing import Any

import httpx

from app.config import settings
from app.core.exceptions import AppError
from app.llm.litellm_client import LiteLLMClient


class LLMModelService:
    def _get_client(self) -> LiteLLMClient:
        if not settings.LITELLM_MASTER_KEY:
            raise AppError(msg="LiteLLM master key not configured", code=500, status_code=500)
        return LiteLLMClient(base_url=settings.LITELLM_BASE_URL, master_key=settings.LITELLM_MASTER_KEY)

    async def list_models(self) -> dict[str, Any]:
        client = self._get_client()
        try:
            return await client.list_models()
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM list models failed", code=502, status_code=502, data=str(e))

    async def add_model(
        self,
        *,
        model_name: str,
        litellm_params: dict[str, Any],
        model_info: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        client = self._get_client()
        try:
            return await client.add_model(model_name=model_name, litellm_params=litellm_params, model_info=model_info)
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM add model failed", code=502, status_code=502, data=str(e))


llm_model_service = LLMModelService()

