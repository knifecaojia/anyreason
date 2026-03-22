from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.core.exceptions import AppError
from app.models import AIModelConfig, Agent, AIUsageEvent
from app.services.credit_service import credit_service


class AgentService:
    _ALLOWED_PURPOSES = {
        "storyboard_extraction",
        "asset_extraction",
        "scene_extraction",
        "character_extraction",
        "prop_extraction",
        "vfx_extraction",
        "scene_creation",
        "prop_creation",
        "character_creation",
        "vfx_creation",
        "general",
    }

    async def list_admin(self, *, db: AsyncSession) -> list[Agent]:
        rows = (await db.execute(select(Agent).order_by(Agent.name.asc()))).scalars().all()
        return list(rows)

    async def get(self, *, db: AsyncSession, agent_id: UUID) -> Agent | None:
        return (await db.execute(select(Agent).where(Agent.id == agent_id))).scalars().first()

    async def create(
        self,
        *,
        db: AsyncSession,
        name: str,
        category: str,
        purpose: str,
        ai_model_config_id,
        capabilities: list[str] | None,
        system_prompt: str | None,
        user_prompt_template: str | None,
        credits_per_call: int,
        enabled: bool,
    ) -> Agent:
        if credits_per_call < 0:
            raise AppError(msg="credits_per_call must be non-negative", code=400, status_code=400)
        if category not in {"text", "image", "video"}:
            raise AppError(msg="Invalid category", code=400, status_code=400)
        purpose = (purpose or "").strip() or "general"
        if purpose not in self._ALLOWED_PURPOSES:
            raise AppError(msg="Invalid purpose", code=400, status_code=400)
        cfg = (
            await db.execute(select(AIModelConfig).where(AIModelConfig.id == ai_model_config_id))
        ).scalars().first()
        if cfg is None:
            raise AppError(msg="AI model config not found", code=404, status_code=404)
        if cfg.category != category:
            raise AppError(msg="AI model category mismatch", code=400, status_code=400)

        inferred_capabilities = capabilities
        if inferred_capabilities is None:
            inferred_capabilities = {
                "text": ["text"],
                "image": ["image"],
                "video": ["video"],
            }.get(category, [])

        row = Agent(
            name=name.strip(),
            category=category,
            purpose=purpose,
            ai_model_config_id=ai_model_config_id,
            capabilities=list(inferred_capabilities),
            system_prompt=system_prompt,
            user_prompt_template=user_prompt_template,
            credits_per_call=int(credits_per_call),
            enabled=bool(enabled),
        )
        db.add(row)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Agent name already exists", code=409, status_code=409)
        await db.refresh(row)
        return row

    async def update(
        self,
        *,
        db: AsyncSession,
        agent_id: UUID,
        patch: dict[str, Any],
    ) -> Agent:
        row = await self.get(db=db, agent_id=agent_id)
        if not row:
            raise AppError(msg="Agent not found", code=404, status_code=404)

        if "credits_per_call" in patch and patch["credits_per_call"] is not None:
            if int(patch["credits_per_call"]) < 0:
                raise AppError(msg="credits_per_call must be non-negative", code=400, status_code=400)

        if "category" in patch and patch["category"] is not None:
            if patch["category"] not in {"text", "image", "video"}:
                raise AppError(msg="Invalid category", code=400, status_code=400)

        if "purpose" in patch and patch["purpose"] is not None:
            if patch["purpose"] not in self._ALLOWED_PURPOSES:
                raise AppError(msg="Invalid purpose", code=400, status_code=400)

        for k, v in patch.items():
            if v is None:
                continue
            if k in {"name"} and isinstance(v, str):
                setattr(row, k, v.strip())
            else:
                setattr(row, k, v)

        if "ai_model_config_id" in patch and patch["ai_model_config_id"] is not None:
            cfg = (
                await db.execute(select(AIModelConfig).where(AIModelConfig.id == row.ai_model_config_id))
            ).scalars().first()
            if cfg is None:
                raise AppError(msg="AI model config not found", code=404, status_code=404)
            if cfg.category != row.category:
                raise AppError(msg="AI model category mismatch", code=400, status_code=400)

        if row.capabilities is None or (isinstance(row.capabilities, list) and len(row.capabilities) == 0):
            row.capabilities = {
                "text": ["text"],
                "image": ["image"],
                "video": ["video"],
            }.get(row.category, [])

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise AppError(msg="Agent name already exists", code=409, status_code=409)

        await db.refresh(row)
        return row

    async def delete(self, *, db: AsyncSession, agent_id: UUID) -> None:
        row = await self.get(db=db, agent_id=agent_id)
        if not row:
            return
        await db.delete(row)
        await db.commit()

    async def run_text_agent(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        agent_id: UUID,
        input_text: str,
        variables: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        agent = await self.get(db=db, agent_id=agent_id)
        if not agent or not agent.enabled:
            raise AppError(msg="Agent not found or not available", code=404, status_code=404)
        if agent.category != "text":
            raise AppError(msg="Agent category not supported", code=400, status_code=400)

        input_text = (input_text or "").strip()
        vars_map = dict(variables or {})
        vars_map.setdefault("input", input_text)

        user_prompt = input_text
        tpl = (agent.user_prompt_template or "").strip()
        if tpl:
            try:
                user_prompt = tpl.format_map(vars_map)
            except KeyError as e:
                raise AppError(msg="Missing template variable", code=400, status_code=400, data=str(e))

        if not getattr(agent, "ai_model_config_id", None):
            raise AppError(msg="Agent model not configured", code=400, status_code=400)

        cost = int(agent.credits_per_call or 0)
        event_id: str | None = None
        original_txn_id: str | None = None
        placeholder_event: AIUsageEvent | None = None  # Track placeholder for update

        # Track event data for creation after operation completes
        event_data: dict[str, Any] = {
            "agent_id": str(agent.id),
            "agent_name": agent.name,
        }

        if cost > 0:
            # Pre-create AIUsageEvent for traceability (agents are text-only currently)
            placeholder_event = AIUsageEvent(
                user_id=user_id,
                category="text",
                binding_key=None,
                ai_model_config_id=agent.ai_model_config_id,
                cost_credits=0,
                latency_ms=None,
                error_code=None,
                raw_payload=event_data,
            )
            db.add(placeholder_event)
            await db.flush()
            event_id = str(placeholder_event.id)

            account, txn = await credit_service.adjust_balance(
                db=db,
                user_id=user_id,
                delta=-cost,
                reason="agent.consume",
                actor_user_id=None,
                meta={
                    "trace_type": "agent",
                    "agent_id": str(agent.id),
                    "agent_name": agent.name,
                    "ai_model_config_id": str(agent.ai_model_config_id),
                    "ai_usage_event_id": event_id,
                    "refunded": False,
                },
                allow_negative=False,
            )
            await db.commit()
            original_txn_id = str(txn.id) if txn else None

        messages: list[dict] = []
        if (agent.system_prompt or "").strip():
            messages.append({"role": "system", "content": agent.system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        started = time.perf_counter()
        error_code: str | None = None

        try:
            raw = await ai_gateway_service.chat_text(
                db=db,
                user_id=user_id,
                binding_key=None,
                model_config_id=agent.ai_model_config_id,
                messages=messages,
                attachments=[],
                credits_cost=0,  # Agent handles its own charging
            )
        except AppError as e:
            error_code = "app_error"
            if cost > 0 and original_txn_id:
                await credit_service.adjust_balance(
                    db=db,
                    user_id=user_id,
                    delta=cost,
                    reason="agent.refund",
                    actor_user_id=None,
                    meta={
                        "trace_type": "agent",
                        "agent_id": str(agent.id),
                        "agent_name": agent.name,
                        "ai_model_config_id": str(agent.ai_model_config_id),
                        "ai_usage_event_id": event_id,
                        "refunded": True,
                        "original_transaction_id": original_txn_id,
                        "original_delta": -cost,
                        "error_code": "app_error",
                        "error_message": str(e.msg) if hasattr(e, 'msg') else None,
                    },
                    allow_negative=False,
                )
                await db.commit()
            raise

        output_text = ""
        try:
            output_text = raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
        except Exception:
            output_text = ""

        # Update placeholder AIUsageEvent with final values instead of creating new row
        # This ensures credit_transactions.meta.ai_usage_event_id points to the correct event
        if placeholder_event is not None:
            latency_ms = int((time.perf_counter() - started) * 1000)
            event_data["output_chars"] = len(output_text)
            event_data["refunded"] = False

            placeholder_event.cost_credits = cost  # type: ignore[assignment]
            placeholder_event.latency_ms = latency_ms  # type: ignore[assignment]
            placeholder_event.error_code = error_code  # type: ignore[assignment]
            placeholder_event.raw_payload = event_data  # type: ignore[assignment]
            try:
                await db.commit()
            except Exception:
                await db.rollback()
        elif cost == 0:
            # Edge case: no cost, create event without linkage
            latency_ms = int((time.perf_counter() - started) * 1000)
            event_data["output_chars"] = len(output_text)
            event_data["refunded"] = False
            final_event = AIUsageEvent(
                user_id=user_id,
                category="text",
                binding_key=None,
                ai_model_config_id=agent.ai_model_config_id,
                cost_credits=0,
                latency_ms=latency_ms,
                error_code=error_code,
                raw_payload=event_data,
            )
            db.add(final_event)
            try:
                await db.commit()
            except Exception:
                await db.rollback()

        return str(output_text), raw

    async def run_dialogue_agent(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        agent_id: UUID,
        input_text: str,
        variables: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        return await self.run_text_agent(
            db=db,
            user_id=user_id,
            agent_id=agent_id,
            input_text=input_text,
            variables=variables,
        )


agent_service = AgentService()
