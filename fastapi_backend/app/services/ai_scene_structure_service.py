from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import ai_gateway_service
from app.core.exceptions import AppError
from app.models import AIModelConfig, Episode, Project, Storyboard, Script
from app.schemas import AISceneDraft


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
_FIRST_JSON_RE = re.compile(r"(\{[\s\S]*\}|\[[\s\S]*\])")

_SCENE_STRUCTURE_INJECTION = """
你将从“剧集剧本正文”生成结构化分场信息。请严格按 JSON 输出，不要输出任何多余文字。

输出 JSON Schema:
{
  "scenes": [
    {
      "scene_number": 1,
      "title": "场次标题",
      "content": "场次内容（可引用或归纳）",
      "location": "地点（可选）",
      "time_of_day": "时间（可选，如 DAY/NIGHT）",
      "location_type": "内|外|内外（可选）"
    }
  ]
}

规则:
1) scenes 必须是数组，且至少包含 1 个元素
2) scene_number 从 1 开始连续递增
3) title 简洁清晰，尽量包含内外景与地点与时间信息
4) content 从剧本文字中提取或概括，避免过度发挥
5) 不确定的字段用 null

剧集剧本正文:
<EPISODE_SCRIPT>
{episode_script}
</EPISODE_SCRIPT>
""".strip()


def _build_final_prompt(*, prompt_template: str, episode_script: str) -> str:
    tpl = (prompt_template or "").strip()
    injected = _SCENE_STRUCTURE_INJECTION.replace("{episode_script}", (episode_script or "").strip())
    if not tpl:
        return injected
    return f"{tpl}\n\n{injected}"


def _extract_json_text(text: str) -> str | None:
    t = (text or "").strip()
    if not t:
        return None
    m = _JSON_FENCE_RE.search(t)
    if m:
        return (m.group(1) or "").strip() or None
    m2 = _FIRST_JSON_RE.search(t)
    if m2:
        return (m2.group(1) or "").strip() or None
    return None


def _parse_scenes_from_output(text: str) -> list[AISceneDraft]:
    json_text = _extract_json_text(text)
    if not json_text:
        raise ValueError("模型返回中未找到 JSON")
    data = json.loads(json_text)
    scenes_payload: Any
    if isinstance(data, dict) and isinstance(data.get("scenes"), list):
        scenes_payload = data.get("scenes")
    elif isinstance(data, list):
        scenes_payload = data
    else:
        raise ValueError("JSON 格式不符合预期（需要 {scenes:[...]} 或 [...]）")

    out: list[AISceneDraft] = []
    for item in scenes_payload:
        if not isinstance(item, dict):
            continue
        draft = AISceneDraft.model_validate(item)
        if not (draft.title or draft.content):
            continue
        out.append(draft)
    if not out:
        raise ValueError("未解析到有效分场数据")
    return out


async def _get_episode_for_user(*, db: AsyncSession, user_id: UUID, episode_id: UUID) -> Episode | None:
    result = await db.execute(
        select(Episode)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Episode.id == episode_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    return result.scalars().first()


async def _chat_completions(
    *,
    db: AsyncSession,
    user_id: UUID,
    model_config_id: UUID,
    messages: list[dict[str, Any]],
    temperature: float | None,
    max_tokens: int | None,
) -> dict[str, Any]:
    raw = await ai_gateway_service.chat_text(
        db=db,
        user_id=user_id,
        binding_key=None,
        model_config_id=model_config_id,
        messages=messages,
        attachments=[],
        credits_cost=1,
    )
    return raw


def _extract_output_text(raw: dict[str, Any]) -> str:
    try:
        return raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    except Exception:
        return ""


class AISceneStructureService:
    async def list_models(self, *, db: AsyncSession) -> list[dict[str, str]]:
        rows = (
            await db.execute(
                select(AIModelConfig)
                .where(AIModelConfig.enabled.is_(True), AIModelConfig.category == "text")
                .order_by(AIModelConfig.sort_order.asc(), AIModelConfig.created_at.asc())
            )
        ).scalars().all()
        return [{"provider": r.manufacturer, "model": r.model} for r in rows]

    async def build_prompt_preview(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        episode_id: UUID,
        prompt_template: str,
    ) -> str:
        episode = await _get_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
        if not episode:
            raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)
        return _build_final_prompt(prompt_template=prompt_template, episode_script=episode.script_full_text or "")

    async def preview(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        episode_id: UUID,
        model: str,
        prompt_template: str,
        temperature: float | None,
        max_tokens: int | None,
    ) -> tuple[str, str, list[AISceneDraft]]:
        cfg = (
            await db.execute(
                select(AIModelConfig).where(
                    AIModelConfig.enabled.is_(True),
                    AIModelConfig.category == "text",
                    AIModelConfig.model == (model or "").strip(),
                )
            )
        ).scalars().first()
        if cfg is None:
            raise AppError(msg="Model not found", code=400, status_code=400)

        episode = await _get_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
        if not episode:
            raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)

        final_prompt = _build_final_prompt(prompt_template=prompt_template, episode_script=episode.script_full_text or "")
        messages = [
            {"role": "system", "content": "你是一个严谨的编剧助手，只输出符合要求的 JSON。"},
            {"role": "user", "content": final_prompt},
        ]
        raw = await _chat_completions(
            db=db,
            user_id=user_id,
            model_config_id=cfg.id,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        output_text = _extract_output_text(raw)
        scenes = _parse_scenes_from_output(output_text)
        return final_prompt, output_text, scenes

    async def apply(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        episode_id: UUID,
        scenes: list[AISceneDraft],
        mode: str,
    ) -> int:
        episode = await _get_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
        if not episode:
            raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)

        if mode not in {"replace", "append"}:
            raise AppError(msg="Invalid mode", code=400, status_code=400)

        if not scenes:
            raise AppError(msg="No scenes to apply", code=400, status_code=400)

        start_num = 0
        if mode == "replace":
            await db.execute(delete(Storyboard).where(Storyboard.episode_id == episode.id))
        else:
            max_res = await db.execute(
                select(func.coalesce(func.max(Storyboard.scene_number), 0)).where(Storyboard.episode_id == episode.id)
            )
            start_num = int(max_res.scalar_one() or 0)

        ordered = list(scenes)
        if all(s.scene_number is not None for s in ordered):
            ordered.sort(key=lambda s: int(s.scene_number or 0))

        created_count = 0
        for idx, s in enumerate(ordered, start=1):
            num = start_num + idx
            
            # Create a placeholder Storyboard for the Scene
            # Shot 1 of this scene
            sc_code = f"EP{episode.episode_number:03d}_SC{num:02d}"
            shot_code = f"{sc_code}_SH01"
            
            row = Storyboard(
                episode_id=episode.id,
                shot_code=shot_code,
                shot_number=1, # Default to shot 1
                scene_code=sc_code,
                scene_number=num,
                
                # Scene attributes now live on Storyboard
                description=(s.content or "").strip() or s.title, # Use content as description
                # title is not directly on storyboard, maybe put in description or ignore?
                # Let's prepend title to description if present
                
                location=(s.location or "").strip() or None,
                time_of_day=(s.time_of_day or "").strip() or None,
                location_type=s.location_type,
            )
            if s.title and s.content:
                 row.description = f"[{s.title}] {s.content}"
            elif s.title:
                 row.description = f"[{s.title}]"
            
            db.add(row)
            created_count += 1

        await db.commit()
        return created_count


ai_scene_structure_service = AISceneStructureService()
