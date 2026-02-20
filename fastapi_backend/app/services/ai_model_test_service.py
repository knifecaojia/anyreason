from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError
from app.models import AIModelTestImageRun, AIModelTestSession, AIModelTestTextRun, AIModelTestVideoRun


class AIModelTestService:
    async def list_sessions(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        category: str | None = None,
        ai_model_config_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AIModelTestSession], int]:
        base_query = select(AIModelTestSession).where(AIModelTestSession.user_id == user_id)
        if category:
            base_query = base_query.where(AIModelTestSession.category == category)
        if ai_model_config_id:
            base_query = base_query.where(AIModelTestSession.ai_model_config_id == ai_model_config_id)

        count_query = select(func.count()).select_from(base_query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        opts = []
        if category == "image":
            opts = [selectinload(AIModelTestSession.image_runs)]
        elif category == "text":
            opts = [selectinload(AIModelTestSession.text_runs)]
        elif category == "video":
            opts = [selectinload(AIModelTestSession.video_runs)]
        else:
            opts = [
                selectinload(AIModelTestSession.image_runs),
                selectinload(AIModelTestSession.text_runs),
                selectinload(AIModelTestSession.video_runs),
            ]

        query = (
            base_query.options(*opts)
            .order_by(AIModelTestSession.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(query)
        items = list(result.scalars().all())
        return items, total

    async def get_session(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        with_runs: bool = True,
    ) -> AIModelTestSession | None:
        q = select(AIModelTestSession).where(AIModelTestSession.id == session_id, AIModelTestSession.user_id == user_id)
        if with_runs:
            q = q.options(
                selectinload(AIModelTestSession.image_runs),
                selectinload(AIModelTestSession.text_runs),
                selectinload(AIModelTestSession.video_runs),
            )
        result = await db.execute(q)
        return result.scalar_one_or_none()

    async def create_session(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        category: str,
        ai_model_config_id: UUID | None,
        title: str | None,
    ) -> AIModelTestSession:
        session = AIModelTestSession(
            user_id=user_id,
            category=category,
            ai_model_config_id=ai_model_config_id,
            title=title or "模型测试",
        )
        db.add(session)
        await db.flush()
        return session

    async def touch_session(self, *, db: AsyncSession, session_id: UUID):
        await db.execute(
            update(AIModelTestSession)
            .where(AIModelTestSession.id == session_id)
            .values(updated_at=datetime.now(timezone.utc))
        )

    async def ensure_session_for_image_test(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        model_config_id: UUID,
        session_id: UUID | None,
        title: str | None,
    ) -> AIModelTestSession:
        return await self.ensure_session_for_test(
            db=db,
            user_id=user_id,
            category="image",
            model_config_id=model_config_id,
            session_id=session_id,
            title=title,
        )

    async def ensure_session_for_text_test(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        model_config_id: UUID,
        session_id: UUID | None,
        title: str | None,
    ) -> AIModelTestSession:
        return await self.ensure_session_for_test(
            db=db,
            user_id=user_id,
            category="text",
            model_config_id=model_config_id,
            session_id=session_id,
            title=title,
        )

    async def ensure_session_for_video_test(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        model_config_id: UUID,
        session_id: UUID | None,
        title: str | None,
    ) -> AIModelTestSession:
        return await self.ensure_session_for_test(
            db=db,
            user_id=user_id,
            category="video",
            model_config_id=model_config_id,
            session_id=session_id,
            title=title,
        )

    async def ensure_session_for_test(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        category: str,
        model_config_id: UUID,
        session_id: UUID | None,
        title: str | None,
    ) -> AIModelTestSession:
        if session_id:
            s = await self.get_session(db=db, user_id=user_id, session_id=session_id, with_runs=False)
            if not s:
                raise AppError(msg="测试会话不存在", code=404, status_code=404)
            if s.category != category:
                raise AppError(msg="测试会话类型不匹配", code=400, status_code=400)
            if s.ai_model_config_id and s.ai_model_config_id != model_config_id:
                raise AppError(msg="测试会话模型不匹配", code=400, status_code=400)
            if not s.ai_model_config_id:
                s.ai_model_config_id = model_config_id
            if title and title.strip():
                s.title = title.strip()
            await db.flush()
            return s
        return await self.create_session(db=db, user_id=user_id, category=category, ai_model_config_id=model_config_id, title=title)

    async def add_image_run(
        self,
        *,
        db: AsyncSession,
        session_id: UUID,
        prompt: str,
        resolution: str | None,
        input_image_count: int,
        input_file_node_ids: list[UUID] | None,
        output_file_node_id: UUID | None,
        output_content_type: str | None,
        output_url: str | None,
        raw_payload: dict | None,
        error_message: str | None,
    ) -> AIModelTestImageRun:
        run = AIModelTestImageRun(
            session_id=session_id,
            prompt=prompt,
            resolution=resolution,
            input_image_count=int(input_image_count or 0),
            input_file_node_ids=[str(x) for x in (input_file_node_ids or [])],
            output_file_node_id=output_file_node_id,
            output_content_type=output_content_type,
            output_url=output_url,
            raw_payload=raw_payload,
            error_message=error_message,
        )
        db.add(run)
        await db.flush()
        await self.touch_session(db=db, session_id=session_id)
        return run

    async def add_text_run(
        self,
        *,
        db: AsyncSession,
        session_id: UUID,
        messages: list[dict],
        output_text: str | None,
        raw_payload: dict | None,
        error_message: str | None,
    ) -> AIModelTestTextRun:
        run = AIModelTestTextRun(
            session_id=session_id,
            messages=messages or [],
            output_text=output_text,
            raw_payload=raw_payload,
            error_message=error_message,
        )
        db.add(run)
        await db.flush()
        await self.touch_session(db=db, session_id=session_id)
        return run

    async def add_video_run(
        self,
        *,
        db: AsyncSession,
        session_id: UUID,
        prompt: str,
        duration: int | None,
        aspect_ratio: str | None,
        input_file_node_ids: list[UUID] | None,
        output_file_node_id: UUID | None,
        output_content_type: str | None,
        output_url: str | None,
        raw_payload: dict | None,
        error_message: str | None,
    ) -> AIModelTestVideoRun:
        run = AIModelTestVideoRun(
            session_id=session_id,
            prompt=prompt,
            duration=duration,
            aspect_ratio=aspect_ratio,
            input_file_node_ids=[str(x) for x in (input_file_node_ids or [])],
            output_file_node_id=output_file_node_id,
            output_content_type=output_content_type,
            output_url=output_url,
            raw_payload=raw_payload,
            error_message=error_message,
        )
        db.add(run)
        await db.flush()
        await self.touch_session(db=db, session_id=session_id)
        return run


ai_model_test_service = AIModelTestService()
