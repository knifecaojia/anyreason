from __future__ import annotations

import hashlib
import base64
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.llm.litellm_client import LiteLLMClient
from app.repositories.llm_repository import llm_repository


class LLMKeyService:
    def _get_fernet(self) -> Fernet:
        raw = settings.LITELLM_MASTER_KEY or ""
        seed = (settings.ACCESS_SECRET_KEY or "").encode("utf-8")
        if raw:
            seed = (settings.ACCESS_SECRET_KEY + raw).encode("utf-8")
        key = base64.urlsafe_b64encode(hashlib.sha256(seed).digest())
        return Fernet(key)

    def _get_client(self) -> LiteLLMClient:
        if not settings.LITELLM_MASTER_KEY:
            raise AppError(msg="LiteLLM master key not configured", code=500, status_code=500)
        return LiteLLMClient(base_url=settings.LITELLM_BASE_URL, master_key=settings.LITELLM_MASTER_KEY)

    def _default_allowed_models(self) -> list[str] | None:
        raw = (settings.LITELLM_VIRTUAL_KEY_ALLOWED_MODELS or "").strip()
        if not raw:
            return []
        if raw in {"*", "all"}:
            return ["*"]
        return [m.strip() for m in raw.split(",") if m.strip()]

    async def list_my_keys(self, *, db: AsyncSession, user_id: UUID):
        return await llm_repository.list_user_virtual_keys(db=db, user_id=user_id)

    async def get_or_issue_user_token(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        purpose: str = "default",
        models: list[str] | None = None,
    ) -> str:
        rows = await llm_repository.list_user_virtual_keys(db=db, user_id=user_id)
        fernet = self._get_fernet()
        for r in rows:
            if r.purpose != purpose or r.status != "active":
                continue
            if not r.encrypted_token:
                continue
            try:
                return fernet.decrypt(r.encrypted_token).decode("utf-8")
            except InvalidToken:
                continue

        token, _ = await self.issue_my_key(db=db, user_id=user_id, purpose=purpose, models=models)
        return token

    async def issue_my_key(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        purpose: str = "default",
        duration_seconds: int | None = None,
        models: list[str] | None = None,
    ) -> tuple[str, object]:
        client = self._get_client()
        models = models if models is not None else self._default_allowed_models()
        if models == []:
            raise AppError(msg="No allowed models configured", code=500, status_code=500)

        duration = None
        expires_at = None
        if duration_seconds and duration_seconds > 0:
            duration = timedelta(seconds=duration_seconds)
            expires_at = datetime.now(timezone.utc) + duration

        try:
            res = await client.generate_key(
                models=models,
                metadata={"user_id": str(user_id), "purpose": purpose},
                duration=duration,
            )
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM generate key failed", code=502, status_code=502, data=str(e))

        token = res.get("key") or res.get("token") or res.get("api_key")
        if not token or not isinstance(token, str):
            raise AppError(msg="LiteLLM returned invalid key payload", code=502, status_code=502, data=res)

        key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        key_prefix = token[:12]
        litellm_key_id = res.get("key_id") if isinstance(res.get("key_id"), str) else None
        encrypted_token = self._get_fernet().encrypt(token.encode("utf-8"))

        row = await llm_repository.create_virtual_key(
            db=db,
            user_id=user_id,
            purpose=purpose,
            litellm_key_id=litellm_key_id,
            key_prefix=key_prefix,
            key_hash=key_hash,
            encrypted_token=encrypted_token,
            expires_at=expires_at,
        )
        await db.commit()
        await db.refresh(row)
        return token, row

    async def rotate_my_key(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        purpose: str = "default",
        duration_seconds: int | None = None,
        models: list[str] | None = None,
    ) -> tuple[str, object]:
        client = self._get_client()
        rows = await llm_repository.list_user_virtual_keys(db=db, user_id=user_id)
        active_rows = [r for r in rows if r.purpose == purpose and r.status == "active"]
        fernet = self._get_fernet()
        for r in active_rows:
            if not r.encrypted_token:
                continue
            try:
                token = fernet.decrypt(r.encrypted_token).decode("utf-8")
            except InvalidToken:
                continue
            try:
                await client.revoke_key(key=token)
            except httpx.HTTPError:
                continue

        await llm_repository.revoke_user_keys_by_purpose(db=db, user_id=user_id, purpose=purpose)
        await db.commit()
        return await self.issue_my_key(
            db=db,
            user_id=user_id,
            purpose=purpose,
            duration_seconds=duration_seconds,
            models=models,
        )

    async def revoke_my_key(self, *, db: AsyncSession, user_id: UUID, key_id: UUID) -> None:
        row = await llm_repository.get_user_virtual_key(db=db, user_id=user_id, key_id=key_id)
        if row is None:
            raise AppError(msg="Key not found", code=404, status_code=404)
        if row.status != "active":
            await llm_repository.revoke_virtual_key(db=db, user_id=user_id, key_id=key_id)
            await db.commit()
            return

        if not row.encrypted_token:
            raise AppError(msg="Key cannot be revoked (missing token)", code=409, status_code=409)

        client = self._get_client()
        fernet = self._get_fernet()
        try:
            token = fernet.decrypt(row.encrypted_token).decode("utf-8")
        except InvalidToken:
            raise AppError(msg="Key cannot be revoked (decrypt failed)", code=409, status_code=409)

        try:
            await client.revoke_key(key=token)
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM revoke key failed", code=502, status_code=502, data=str(e))

        ok = await llm_repository.revoke_virtual_key(db=db, user_id=user_id, key_id=key_id)
        if not ok:
            raise AppError(msg="Key not found", code=404, status_code=404)
        await db.commit()


llm_key_service = LLMKeyService()
