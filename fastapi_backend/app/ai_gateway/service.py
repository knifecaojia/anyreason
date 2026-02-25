from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway.factory import provider_factory
from app.ai_gateway.providers.media_factory import media_provider_factory
from app.schemas_media import MediaRequest, MediaResponse
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
    ) -> tuple[ResolvedModelConfig, UUID, str | None]:
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
        if cfg_row.category != category:
            raise AppError(msg="AI model category mismatch", code=400, status_code=400)
        if not cfg_row.enabled:
            raise AppError(msg="AI model config disabled", code=400, status_code=400)
        if not cfg_row.encrypted_api_key:
            raise AppError(msg="AI model api_key missing", code=400, status_code=400)

        manufacturer = (cfg_row.manufacturer or "").strip().lower()
        if category == "text" and manufacturer != "openai" and not (cfg_row.base_url or "").strip():
            raise AppError(
                msg="AI model base_url required for this manufacturer",
                code=400,
                status_code=400,
                data={"manufacturer": manufacturer},
            )

        api_key = self._fernet().decrypt(cfg_row.encrypted_api_key).decode("utf-8")
        return (
            ResolvedModelConfig(
                category=category,
                manufacturer=cfg_row.manufacturer,
                model=cfg_row.model,
                base_url=cfg_row.base_url,
                api_key=api_key,
            ),
            cfg_row.id,
            resolved_binding_key,
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
        cfg, cfg_id, resolved_binding_key = await self._resolve_model_config(
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
        cfg, cfg_id, resolved_binding_key = await self._resolve_model_config(
            db=db,
            category=category,
            binding_key=binding_key,
            model_config_id=model_config_id,
            default_binding_key=category,
        )

        param_json = param_json or {}
        
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
            provider = media_provider_factory.get_provider(
                manufacturer=cfg.manufacturer,
                api_key=cfg.api_key,
                base_url=cfg.base_url
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
        cfg, cfg_id, resolved_binding_key = await self._resolve_model_config(
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
