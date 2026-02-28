from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import AIChatMessage, AIChatSession


class AIChatSessionService:
    async def list_sessions(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        project_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AIChatSession], int]:
        base_query = select(AIChatSession).where(AIChatSession.user_id == user_id)
        if project_id:
            base_query = base_query.where(AIChatSession.project_id == project_id)

        count_query = select(func.count()).select_from(base_query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        query = (
            base_query
            .options(selectinload(AIChatSession.messages))
            .order_by(AIChatSession.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(query)
        sessions = list(result.scalars().all())
        return sessions, total

    async def get_session(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
    ) -> AIChatSession | None:
        query = (
            select(AIChatSession)
            .where(AIChatSession.id == session_id, AIChatSession.user_id == user_id)
            .options(selectinload(AIChatSession.messages))
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def create_session(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        scene_code: str,
        project_id: UUID | None = None,
        title: str | None = None,
    ) -> AIChatSession:
        session = AIChatSession(
            user_id=user_id,
            project_id=project_id,
            scene_code=scene_code,
            title=title or "新对话",
        )
        db.add(session)
        await db.flush()
        return session

    async def update_session(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        title: str | None = None,
    ) -> AIChatSession | None:
        session = await self.get_session(db=db, user_id=user_id, session_id=session_id)
        if not session:
            return None
        if title:
            session.title = title
            session.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return session

    async def delete_session(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
    ) -> bool:
        stmt = delete(AIChatSession).where(
            AIChatSession.id == session_id,
            AIChatSession.user_id == user_id
        )
        result = await db.execute(stmt)
        await db.flush()
        return result.rowcount > 0

    async def delete_all_sessions(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        project_id: UUID | None = None,
    ) -> int:
        stmt = delete(AIChatSession).where(AIChatSession.user_id == user_id)
        if project_id:
            stmt = stmt.where(AIChatSession.project_id == project_id)
        
        result = await db.execute(stmt)
        await db.flush()
        return result.rowcount

    async def touch_session(
        self,
        *,
        db: AsyncSession,
        session_id: UUID,
    ):
        await db.execute(
            update(AIChatSession)
            .where(AIChatSession.id == session_id)
            .values(updated_at=datetime.now(timezone.utc))
        )

    async def add_message(
        self,
        *,
        db: AsyncSession,
        session_id: UUID,
        role: str,
        content: str,
        plans: list[dict] | None = None,
        trace: list[dict] | None = None,
    ) -> AIChatMessage:
        message = AIChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            plans=plans,
            trace=trace,
        )
        db.add(message)
        await db.flush()
        return message

    async def generate_session_title(
        self,
        *,
        scene_code: str,
        first_message: str,
        timestamp: datetime,
    ) -> str:
        scene_names = {
            "asset_extract": "资产提取",
            "scene_extract": "场景提取",
            "character_extract": "角色提取",
            "storyboard_generate": "分镜生成",
            "script_analyze": "剧本分析",
        }
        scene_name = scene_names.get(scene_code, scene_code)
        time_str = timestamp.strftime("%m/%d %H:%M")
        msg_preview = first_message[:20] if len(first_message) > 20 else first_message
        return f"{scene_name} - {time_str} - {msg_preview}"


ai_chat_session_service = AIChatSessionService()
