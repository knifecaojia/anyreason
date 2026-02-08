from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.crypto import build_fernet
from app.llm.litellm_client import LiteLLMClient
from app.repositories.llm_custom_service_repository import llm_custom_service_repository


def _slugify(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "custom"


def _normalize_openai_compatible_base_url(url: str) -> str:
    u = url.strip().rstrip("/")
    if not u:
        return u
    if u.endswith("/v1"):
        return u
    return f"{u}/v1"


class LLMCustomServiceService:
    def _fernet(self):
        return build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))

    def _get_client(self) -> LiteLLMClient:
        if not settings.LITELLM_MASTER_KEY:
            raise AppError(msg="LiteLLM master key not configured", code=500, status_code=500)
        return LiteLLMClient(base_url=settings.LITELLM_BASE_URL, master_key=settings.LITELLM_MASTER_KEY)

    async def list_services(self, *, db: AsyncSession):
        return await llm_custom_service_repository.list_services(db=db)

    async def create_openai_compatible_service(
        self,
        *,
        db: AsyncSession,
        name: str,
        base_url: str,
        api_key: str,
        models: list[str],
        enabled: bool = True,
    ):
        if not name.strip():
            raise AppError(msg="name is required", code=400, status_code=400)
        if not api_key.strip():
            raise AppError(msg="api_key is required", code=400, status_code=400)
        if not models:
            raise AppError(msg="models is required", code=400, status_code=400)

        normalized_base_url = _normalize_openai_compatible_base_url(base_url)
        if not normalized_base_url:
            raise AppError(msg="base_url is required", code=400, status_code=400)
        if not (normalized_base_url.startswith("http://") or normalized_base_url.startswith("https://")):
            raise AppError(msg="base_url must start with http(s)://", code=400, status_code=400)

        encrypted_api_key = self._fernet().encrypt(api_key.encode("utf-8"))

        row = await llm_custom_service_repository.create_service(
            db=db,
            name=name.strip(),
            kind="openai_compatible",
            base_url=normalized_base_url,
            supported_models=models,
            created_models=[],
            encrypted_api_key=encrypted_api_key,
            enabled=enabled,
        )
        await db.commit()
        await db.refresh(row)

        client = self._get_client()
        slug = _slugify(row.name)
        created_model_names: list[str] = []
        for m in models:
            m = m.strip()
            if not m:
                continue
            model_name = f"{slug}-{m}"
            try:
                await client.add_model(
                    model_name=model_name,
                    litellm_params={"model": f"openai/{m}", "api_base": normalized_base_url, "api_key": api_key},
                    model_info={
                        "custom_service_id": str(row.id),
                        "custom_service_name": row.name,
                        "custom_service_kind": "openai_compatible",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            except httpx.HTTPError as e:
                raise AppError(
                    msg="LiteLLM add model failed for custom service",
                    code=502,
                    status_code=502,
                    data={"model_name": model_name, "error": str(e)},
                )
            created_model_names.append(model_name)

        await llm_custom_service_repository.set_created_models(db=db, service_id=row.id, created_models=created_model_names)
        await db.commit()
        await db.refresh(row)
        return row

    async def delete_service(self, *, db: AsyncSession, service_id: UUID) -> None:
        row = await llm_custom_service_repository.get_service(db=db, service_id=service_id)
        if row is None:
            raise AppError(msg="Service not found", code=404, status_code=404)
        await db.delete(row)
        await db.commit()


llm_custom_service_service = LLMCustomServiceService()
