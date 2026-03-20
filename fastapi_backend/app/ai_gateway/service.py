from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway.factory import provider_factory
from app.ai_gateway.providers.media_factory import media_provider_factory
from app.schemas_media import ExternalTaskRef, ExternalTaskStatus, MediaRequest, MediaResponse
from app.ai_gateway.types import ResolvedModelConfig
from app.config import settings
from app.core.exceptions import AppError
from app.crypto import build_fernet
from app.log import logger
from app.models import AIModelBinding, AIModelConfig, AIUsageEvent
from app.services.credit_service import credit_service


def _extract_api_error(e: Exception) -> str:
    """从 API 异常中提取友好的错误信息"""
    err_str = str(e)
    
    patterns = [
        (r"'message':\s*'([^']+)'", 1),
        (r'"message":\s*"([^"]+)"', 1),
        (r"Error code:\s*(\d+)", 0),
        (r"insufficient_quota", "配额不足"),
        (r"rate_limit", "请求过于频繁"),
        (r"invalid_api_key", "API Key 无效"),
        (r"model_not_found", "模型不存在"),
        (r"context_length_exceeded", "上下文长度超限"),
        (r"PermissionDeniedError", "权限被拒绝"),
    ]
    
    for pattern, group in patterns:
        match = re.search(pattern, err_str, re.IGNORECASE)
        if match:
            if isinstance(group, int):
                return match.group(group)
            return group
    
    if len(err_str) > 200:
        return err_str[:200] + "..."
    return err_str


def _merge_attachments(messages: list[dict[str, Any]], attachments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged_messages = list(messages)
    if not attachments:
        return merged_messages

    text_parts: list[str] = []
    image_urls: list[str] = []
    for a in attachments:
        kind = a.get("kind")
        if kind == "text":
            t = str(a.get("text") or "").strip()
            if t:
                name = str(a.get("name") or "").strip()
                if name:
                    text_parts.append(f"[附件:{name}]\n{t}")
                else:
                    text_parts.append(t)
        elif kind == "image":
            u = str(a.get("data_url") or "").strip()
            if u:
                image_urls.append(u)

    if not text_parts and not image_urls:
        return merged_messages

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
    return merged_messages


class AIGatewayService:
    def _fernet(self):
        return build_fernet(seed=settings.ACCESS_SECRET_KEY.encode("utf-8"))

    async def _resolve_model_config(
        self,
        *,
        db: AsyncSession,
        category: str,
        binding_key: str | None,
        model_config_id: UUID | None,
        default_binding_key: str,
        skip_slot_acquisition: bool = False,
        allow_queue: bool = False,
    ) -> tuple[ResolvedModelConfig, UUID, str | None, dict[str, Any] | None]:
        """
        Resolve model config and optionally acquire a concurrency slot.
        
        Args:
            allow_queue: If True, returns queue info instead of raising on slot exhaustion.
                        If False (default), raises 429 on slot exhaustion for fail-fast behavior.
        
        Returns:
            tuple of (ResolvedModelConfig, config_id, binding_key, slot_acquisition_result)
            - slot_acquisition_result is None when skip_slot_acquisition=True
            - slot_acquisition_result contains {"api_key": ..., "owner_token": ..., ...} when slot acquired
            - slot_acquisition_result contains {"queue_position": N, "owner_token": ..., "queued": True} when queued
        """
        cfg_row: AIModelConfig | None = None
        resolved_binding_key: str | None = None

        if model_config_id is not None:
            cfg_row = (await db.execute(select(AIModelConfig).where(AIModelConfig.id == model_config_id))).scalars().first()
        else:
            key = (binding_key or "").strip() or default_binding_key
            resolved_binding_key = key
            binding = (await db.execute(select(AIModelBinding).where(AIModelBinding.key == key))).scalars().first()
            if binding is None or binding.ai_model_config_id is None:
                raise AppError(msg="AI binding not configured", code=400, status_code=400, data={"key": key})
            cfg_row = (await db.execute(select(AIModelConfig).where(AIModelConfig.id == binding.ai_model_config_id))).scalars().first()

        if cfg_row is None:
            raise AppError(msg="AI model config not found", code=404, status_code=404)

        # Normalize ORM row into plain Python locals for type safety
        # SQLAlchemy returns Column[...] from ORM objects; we extract plain values
        cfg_id: UUID = cfg_row.id  # type: ignore[assignment]
        cfg_category: str = cfg_row.category  # type: ignore[assignment]
        cfg_enabled: bool = cfg_row.enabled  # type: ignore[assignment]
        cfg_manufacturer: str | None = cfg_row.manufacturer  # type: ignore[assignment]
        cfg_model: str | None = cfg_row.model  # type: ignore[assignment]
        cfg_base_url: str | None = cfg_row.base_url  # type: ignore[assignment]
        cfg_plaintext_api_key: str | None = cfg_row.plaintext_api_key  # type: ignore[assignment]
        cfg_encrypted_api_key: bytes | None = cfg_row.encrypted_api_key  # type: ignore[assignment]
        cfg_api_keys_info: list[dict[str, Any]] | None = cfg_row.api_keys_info  # type: ignore[assignment]

        if cfg_category != category:  # type: ignore
            raise AppError(msg="AI model category mismatch", code=400, status_code=400)
        if not cfg_enabled:  # type: ignore
            raise AppError(msg="AI model config disabled", code=400, status_code=400)

        # Check for any key (migrated plaintext, legacy encrypted, or multi-keys)
        if not cfg_encrypted_api_key and not cfg_plaintext_api_key and not cfg_api_keys_info:  # type: ignore
            raise AppError(msg="AI model api_key missing", code=400, status_code=400)

        manufacturer = (cfg_manufacturer or "").strip().lower()
        if category == "text" and manufacturer != "openai" and not (cfg_base_url or "").strip():
            raise AppError(
                msg="AI model base_url required for this manufacturer",
                code=400,
                status_code=400,
                data={"manufacturer": manufacturer},
            )

        # Get base key if available (plaintext preferred, fallback to encrypted)
        api_key: str | None = cfg_plaintext_api_key  # type: ignore
        if not api_key and cfg_encrypted_api_key:  # type: ignore
            api_key = self._fernet().decrypt(cfg_encrypted_api_key).decode("utf-8")  # type: ignore

        # For two-phase media tasks, slot acquisition is handled separately
        # by process_two_phase_task() before handler.submit() is called
        if skip_slot_acquisition:
            resolved_api_key = api_key or ""
            return (
                ResolvedModelConfig(
                    category=category,
                    manufacturer=cast(str, cfg_manufacturer),
                    model=cast(str, cfg_model),
                    base_url=cfg_base_url,  # type: ignore
                    api_key=resolved_api_key,
                    config_id=cfg_id,  # type: ignore
                ),
                cfg_id,  # type: ignore
                resolved_binding_key,
                None,  # No slot acquired yet - handled by caller
            )

        from app.ai_gateway.concurrency import concurrency_manager
        chosen = await concurrency_manager.acquire_key(
            config_id=cfg_id,  # type: ignore
            keys_info=cfg_api_keys_info,  # type: ignore
            default_key=api_key
        )

        if not chosen:
            raise AppError(msg="API 负载过高，请稍后再试", code=429, status_code=429)

        # Check if we got a slot or a queue placement
        if chosen.get("queued"):
            if not allow_queue:
                # Non-media paths: fail fast on slot exhaustion
                raise AppError(msg="API 负载过高，请稍后再试", code=429, status_code=429)
            # Media paths with allow_queue=True: return queue info for caller to handle
            return (
                ResolvedModelConfig(
                    category=category,
                    manufacturer=cast(str, cfg_manufacturer),
                    model=cast(str, cfg_model),
                    base_url=cfg_base_url,  # type: ignore
                    api_key=api_key or "",  # placeholder, will be replaced when slot acquired
                    config_id=cfg_id,  # type: ignore
                ),
                cfg_id,  # type: ignore
                resolved_binding_key,
                chosen,  # Queue placement info: {queue_position, owner_token, queued: True}
            )

        return (
            ResolvedModelConfig(
                category=category,
                manufacturer=cast(str, cfg_manufacturer),
                model=cast(str, cfg_model),
                base_url=cfg_base_url,  # type: ignore
                api_key=chosen["api_key"],
                config_id=cfg_id,  # type: ignore
            ),
            cfg_id,  # type: ignore
            resolved_binding_key,
            chosen,  # Slot info: {api_key, owner_token, ...}
        )

    async def chat_text(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        binding_key: str | None,
        model_config_id: UUID | None,
        messages: list[dict[str, Any]],
        attachments: list[dict[str, Any]],
        credits_cost: int = 1,
    ) -> dict[str, Any]:
        cfg, cfg_id, resolved_binding_key, _ = await self._resolve_model_config(
            db=db,
            category="text",
            binding_key=binding_key,
            model_config_id=model_config_id,
            default_binding_key="chatbox",
        )

        credits_cost = int(credits_cost or 0)
        consumed_credits = 0
        if credits_cost > 0:
            await credit_service.adjust_balance(
                db=db,
                user_id=user_id,
                delta=-credits_cost,
                reason="ai.consume",
                actor_user_id=None,
                meta={"category": "text", "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                allow_negative=False,
            )
            await db.commit()
            consumed_credits = credits_cost

        started = time.perf_counter()
        error_code: str | None = None
        raw: dict[str, Any] | None = None
        try:
            provider = provider_factory.get_text_provider(manufacturer=cfg.manufacturer)
            merged_messages = _merge_attachments(messages, attachments)
            raw = await provider.chat_completions(cfg=cfg, messages=merged_messages, timeout_seconds=60.0)
            return raw
        except AppError:
            error_code = "app_error"
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=consumed_credits,
                    reason="ai.refund",
                    actor_user_id=None,
                    meta={"category": "text", "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = 0
            raise
        except Exception as e:
            error_code = "upstream_error"
            friendly_msg = _extract_api_error(e)
            logger.bind(
                context={
                    "category": "text",
                    "binding_key": resolved_binding_key,
                    "manufacturer": cfg.manufacturer,
                    "model": cfg.model,
                    "ai_model_config_id": str(cfg_id) if cfg_id else None,
                    "raw_error": str(e),
                }
            ).exception("ai_gateway.chat_text_failed")
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=consumed_credits,
                    reason="ai.refund",
                    actor_user_id=None,
                    meta={"category": "text", "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = 0
            raise AppError(msg=f"AI 调用失败: {friendly_msg}", code=502, status_code=502, data={"raw": str(e), "friendly": friendly_msg})
        finally:
            if cfg and cfg.config_id:
                from app.ai_gateway.concurrency import concurrency_manager
                await concurrency_manager.release_key(cfg.config_id, cfg.api_key)

            latency_ms = int((time.perf_counter() - started) * 1000)
            db.add(
                AIUsageEvent(
                    user_id=user_id,
                    category="text",
                    binding_key=resolved_binding_key,
                    ai_model_config_id=cfg_id,
                    cost_credits=consumed_credits,
                    latency_ms=latency_ms,
                    error_code=error_code,
                    raw_payload={
                        "manufacturer": cfg.manufacturer,
                        "model": cfg.model,
                        "has_attachments": bool(attachments),
                        "refunded": bool(consumed_credits == 0 and credits_cost > 0 and error_code is not None),
                        "result_keys": list(raw.keys()) if isinstance(raw, dict) else [],
                    },
                )
            )
            try:
                await db.commit()
            except Exception:
                await db.rollback()


    async def generate_media(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        binding_key: str | None,
        model_config_id: UUID | None,
        prompt: str,
        negative_prompt: str | None = None,
        param_json: dict[str, Any] | None = None,
        callback_url: str | None = None,
        category: str = "image",
    ) -> MediaResponse:
        cfg, cfg_id, resolved_binding_key, _ = await self._resolve_model_config(
            db=db,
            category=category,
            binding_key=binding_key,
            model_config_id=model_config_id,
            default_binding_key=category,
        )

        param_json = param_json or {}

        # Video: validate against hardcoded registry (skip for unknown models)
        if category == "video":
            from app.ai_gateway.video_registry import get_video_model_spec
            from app.ai_gateway.video_validator import validate_video_request
            spec = get_video_model_spec(cfg.manufacturer, cfg.model)
            if spec:
                param_json = validate_video_request(spec, param_json)

        # Calculate cost (TODO: Dynamic pricing based on model metadata)
        credits_cost = 10 if category == "video" else 5
        
        consumed_credits = 0
        if credits_cost > 0:
            await credit_service.adjust_balance(
                db=db,
                user_id=user_id,
                delta=-credits_cost,
                reason="ai.consume",
                actor_user_id=None,
                meta={"category": category, "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                allow_negative=False,
            )
            await db.commit()
            consumed_credits = credits_cost

        started = time.perf_counter()
        error_code: str | None = None
        response: MediaResponse | None = None
        
        try:
            # 查找厂商的 provider_class（用于动态新增的厂商）
            from app.models import AIManufacturer
            mfr_row = (await db.execute(
                select(AIManufacturer.provider_class).where(
                    AIManufacturer.code == cfg.manufacturer,
                    AIManufacturer.category == category,
                )
            )).scalar_one_or_none()

            provider = media_provider_factory.get_provider(
                manufacturer=cfg.manufacturer,
                api_key=cfg.api_key,
                base_url=cfg.base_url,
                provider_class=mfr_row,
            )
            
            request = MediaRequest(
                model_key=cfg.model,
                prompt=prompt,
                negative_prompt=negative_prompt,
                param_json=param_json,
                callback_url=callback_url
            )
            
            response = await provider.generate(request)
            return response
            
        except AppError:
            error_code = "app_error"
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=consumed_credits,
                    reason="ai.refund",
                    actor_user_id=None,
                    meta={"category": category, "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = 0
            raise
        except Exception as e:
            error_code = "upstream_error"
            friendly_msg = _extract_api_error(e)
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=consumed_credits,
                    reason="ai.refund",
                    actor_user_id=None,
                    meta={"category": category, "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = 0
            
            # Re-raise AppError directly to preserve original message
            if isinstance(e, AppError):
                raise e
                
            raise AppError(msg=f"AI {category} generation failed: {friendly_msg}", code=502, status_code=502, data={"raw": str(e), "friendly": friendly_msg})
        finally:
            if cfg and cfg.config_id:
                from app.ai_gateway.concurrency import concurrency_manager
                await concurrency_manager.release_key(cfg.config_id, cfg.api_key)

            latency_ms = int((time.perf_counter() - started) * 1000)
            db.add(
                AIUsageEvent(
                    user_id=user_id,
                    category=category,
                    binding_key=resolved_binding_key,
                    ai_model_config_id=cfg_id,
                    cost_credits=consumed_credits,
                    latency_ms=latency_ms,
                    error_code=error_code,
                    raw_payload={
                        "manufacturer": cfg.manufacturer,
                        "model": cfg.model,
                        "param_json": param_json,
                        "refunded": bool(consumed_credits == 0 and credits_cost > 0 and error_code is not None),
                        "url": response.url if response else None,
                        "usage_id": response.usage_id if response else None
                    },
                )
            )
            try:
                await db.commit()
            except Exception:
                await db.rollback()

    async def submit_media_async(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        binding_key: str | None,
        model_config_id: UUID | None,
        prompt: str,
        negative_prompt: str | None = None,
        param_json: dict[str, Any] | None = None,
        callback_url: str | None = None,
        category: str = "video",
        # For two-phase flow: pass the pre-acquired api_key from slot acquisition
        acquired_api_key: str | None = None,
        acquired_config_id: UUID | None = None,
    ) -> ExternalTaskRef:
        """Phase 1 of two-phase async: submit to external provider and return immediately.
        
        For two-phase media tasks (queueable):
        - Slot acquisition is handled by process_two_phase_task() BEFORE calling this method
        - Pass acquired_api_key to use the pre-acquired slot (no additional slot acquisition)
        - The slot will be released when query_media_status() detects terminal state
        
        For synchronous flow:
        - Do NOT pass acquired_api_key (defaults to None)
        - Slot acquisition happens here (raises 429 if no capacity)
        """
        # For two-phase flow: use the pre-acquired api_key
        if acquired_api_key and acquired_config_id:
            # Skip config resolution's slot acquisition - slot was already acquired
            # We still need to resolve the model config for manufacturer/model info
            cfg, cfg_id, resolved_binding_key, _ = await self._resolve_model_config(
                db=db,
                category=category,
                binding_key=binding_key,
                model_config_id=model_config_id,
                default_binding_key=category,
                skip_slot_acquisition=True,  # Skip slot acquisition - already done
            )
            
            # Use the pre-acquired api_key
            cfg = ResolvedModelConfig(
                category=cfg.category,
                manufacturer=cfg.manufacturer,
                model=cfg.model,
                base_url=cfg.base_url,
                api_key=acquired_api_key,
                config_id=acquired_config_id or cfg.config_id,
            )
        else:
            # Synchronous flow: resolve config and acquire slot here
            # Use allow_queue=True so media tasks queue instead of failing with 429
            cfg, cfg_id, resolved_binding_key, slot_result = await self._resolve_model_config(
                db=db,
                category=category,
                binding_key=binding_key,
                model_config_id=model_config_id,
                default_binding_key=category,
                skip_slot_acquisition=False,
                allow_queue=True,  # Allow queue placement instead of raising 429
            )
            
            # Check if we got a queue placement instead of a slot
            if slot_result and slot_result.get("queued"):
                # Slot exhausted - return a "queued" reference
                # The caller should create/update task with queued_for_slot status
                return ExternalTaskRef(
                    external_task_id=f"QUEUED-{slot_result.get('owner_token', 'unknown')}",
                    provider=cfg.manufacturer or category,  # Use manufacturer or category as provider
                    meta={
                        "queued": True,
                        "queue_position": slot_result.get("queue_position"),
                        "slot_owner_token": slot_result.get("owner_token"),
                        "concurrency_config_id": str(cfg_id),  # type: ignore
                        "concurrency_api_key": cfg.api_key,  # placeholder, will be updated when slot acquired
                        "slot_status": "queued_for_slot",
                    },
                )
            
            # Store slot acquisition result for tracking
            if slot_result:
                # Will be tracked in ref.meta below
                pass

        param_json = param_json or {}

        if category == "video":
            from app.ai_gateway.video_registry import get_video_model_spec
            from app.ai_gateway.video_validator import validate_video_request
            spec = get_video_model_spec(cfg.manufacturer, cfg.model)
            if spec:
                param_json = validate_video_request(spec, param_json)

        credits_cost = 10 if category == "video" else 5
        consumed_credits = 0
        if credits_cost > 0:
            await credit_service.adjust_balance(
                db=db,
                user_id=user_id,
                delta=-credits_cost,
                reason="ai.consume",
                actor_user_id=None,
                meta={"category": category, "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                allow_negative=False,
            )
            await db.commit()
            consumed_credits = credits_cost

        try:
            from app.models import AIManufacturer
            mfr_row = (await db.execute(
                select(AIManufacturer.provider_class).where(
                    AIManufacturer.code == cfg.manufacturer,
                    AIManufacturer.category == category,
                )
            )).scalar_one_or_none()

            provider = media_provider_factory.get_provider(
                manufacturer=cfg.manufacturer,
                api_key=cfg.api_key,
                base_url=cfg.base_url,
                provider_class=mfr_row,
            )

            if not provider.supports_async:
                raise AppError(msg=f"Provider {cfg.manufacturer} does not support async submit", code=400, status_code=400)

            request = MediaRequest(
                model_key=cfg.model,
                prompt=prompt,
                negative_prompt=negative_prompt,
                param_json=param_json,
                callback_url=callback_url,
            )

            ref = await provider.submit_async(request)
            # Store concurrency info in ref.meta for later release
            ref.meta["concurrency_config_id"] = str(cfg.config_id)
            ref.meta["concurrency_api_key"] = cfg.api_key
            return ref

        except AppError:
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db, user_id=user_id, delta=consumed_credits,
                    reason="ai.refund", actor_user_id=None,
                    meta={"category": category, "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
            
            # release key immediately on submission failure
            if cfg and cfg.config_id:
                from app.ai_gateway.concurrency import concurrency_manager
                await concurrency_manager.release_key(cfg.config_id, cfg.api_key)
            raise
        except Exception as e:
            friendly_msg = _extract_api_error(e)
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db, user_id=user_id, delta=consumed_credits,
                    reason="ai.refund", actor_user_id=None,
                    meta={"category": category, "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
            
            # release key immediately on submission failure
            if cfg and cfg.config_id:
                from app.ai_gateway.concurrency import concurrency_manager
                await concurrency_manager.release_key(cfg.config_id, cfg.api_key)
            
            if isinstance(e, AppError):
                raise e
            raise AppError(msg=f"AI {category} submit failed: {friendly_msg}", code=502, status_code=502, data={"raw": str(e), "friendly": friendly_msg})

    async def query_media_status(
        self,
        *,
        ref: ExternalTaskRef,
    ) -> ExternalTaskStatus:
        """Query the status of a previously submitted external task.
        Uses the provider info stored in the ExternalTaskRef to find the right provider."""
        provider_key = ref.provider
        api_key = ref.meta.get("api_key", "")
        base_url = ref.meta.get("base_url")

        provider = media_provider_factory.get_provider(
            manufacturer=provider_key,
            api_key=api_key,
            base_url=base_url,
        )
        status = await provider.query_status(ref)
        
        # If terminal state, release the concurrency key
        if status.state in ("succeeded", "failed", "canceled"):
            config_id_str = ref.meta.get("concurrency_config_id")
            api_key = ref.meta.get("concurrency_api_key")
            if config_id_str and api_key:
                from app.ai_gateway.concurrency import concurrency_manager
                await concurrency_manager.release_key(UUID(config_id_str), api_key)
                # clear from meta to avoid double release if polled again
                ref.meta.pop("concurrency_config_id", None)
                ref.meta.pop("concurrency_api_key", None)
        return status

    async def cancel_media_task(
        self,
        *,
        ref: ExternalTaskRef,
    ) -> dict[str, object]:
        provider_key = ref.provider
        api_key = ref.meta.get("api_key", "")
        base_url = ref.meta.get("base_url")

        provider = media_provider_factory.get_provider(
            manufacturer=provider_key,
            api_key=api_key,
            base_url=base_url,
        )
        return await provider.cancel_task(ref.external_task_id)

    async def chat_text_stream(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        binding_key: str | None,
        model_config_id: UUID | None,
        messages: list[dict[str, Any]],
        attachments: list[dict[str, Any]],
        credits_cost: int = 1,
    ) -> AsyncIterator[dict[str, Any]]:
        # Resolve config inside try/except so errors become SSE error events
        # instead of crashing the StreamingResponse.
        try:
            cfg, cfg_id, resolved_binding_key, _ = await self._resolve_model_config(
                db=db,
                category="text",
                binding_key=binding_key,
                model_config_id=model_config_id,
                default_binding_key="chatbox",
            )
        except AppError as e:
            yield {"type": "error", "message": str(e.msg), "code": int(e.code or 400)}
            return

        credits_cost = int(credits_cost or 0)
        consumed_credits = 0
        if credits_cost > 0:
            try:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=-credits_cost,
                    reason="ai.consume",
                    actor_user_id=None,
                    meta={"category": "text", "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = credits_cost
            except AppError as e:
                yield {"type": "error", "message": str(e.msg), "code": int(e.code or 400)}
                return

        started = time.perf_counter()
        error_code: str | None = None
        emitted_any = False
        output_parts: list[str] = []
        try:
            provider = provider_factory.get_text_provider(manufacturer=cfg.manufacturer)
            merged_messages = _merge_attachments(messages, attachments)
            async for delta in provider.chat_completions_stream(cfg=cfg, messages=merged_messages, timeout_seconds=60.0):
                emitted_any = True
                output_parts.append(delta)
                yield {"type": "delta", "delta": delta}
            yield {"type": "done", "output_text": "".join(output_parts)}
        except AppError as e:
            error_code = "app_error"
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=consumed_credits,
                    reason="ai.refund",
                    actor_user_id=None,
                    meta={"category": "text", "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = 0
            yield {"type": "error", "message": str(e.msg), "code": int(e.code or 500)}
            return
        except Exception as e:
            error_code = "upstream_error"
            friendly_msg = _extract_api_error(e)
            logger.bind(
                context={
                    "category": "text",
                    "binding_key": resolved_binding_key,
                    "manufacturer": cfg.manufacturer,
                    "model": cfg.model,
                    "ai_model_config_id": str(cfg_id) if cfg_id else None,
                    "raw_error": str(e),
                }
            ).exception("ai_gateway.chat_text_stream_failed")
            if consumed_credits > 0:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=consumed_credits,
                    reason="ai.refund",
                    actor_user_id=None,
                    meta={"category": "text", "binding_key": resolved_binding_key, "manufacturer": cfg.manufacturer, "model": cfg.model},
                    allow_negative=False,
                )
                await db.commit()
                consumed_credits = 0
            yield {"type": "error", "message": f"AI 调用失败: {friendly_msg}", "code": 502}
            return
        finally:
            if cfg and cfg.config_id:
                from app.ai_gateway.concurrency import concurrency_manager
                await concurrency_manager.release_key(cfg.config_id, cfg.api_key)

            latency_ms = int((time.perf_counter() - started) * 1000)
            db.add(
                AIUsageEvent(
                    user_id=user_id,
                    category="text",
                    binding_key=resolved_binding_key,
                    ai_model_config_id=cfg_id,
                    cost_credits=consumed_credits,
                    latency_ms=latency_ms,
                    error_code=error_code,
                    raw_payload={
                        "manufacturer": cfg.manufacturer,
                        "model": cfg.model,
                        "has_attachments": bool(attachments),
                        "refunded": bool(consumed_credits == 0 and credits_cost > 0 and error_code is not None),
                        "output_chars": sum(len(x) for x in output_parts),
                    },
                )
            )
            try:
                await db.commit()
            except Exception:
                await db.rollback()



ai_gateway_service = AIGatewayService()
