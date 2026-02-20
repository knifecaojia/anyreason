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
from app.schemas import AIShotDraft


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
_FIRST_JSON_RE = re.compile(r"(\{[\s\S]*\}|\[[\s\S]*\])")
_SHOT_HEADER_RE = re.compile(r"(?im)^\s*###\s*镜头\s*\d+[^\n]*$")
_MD_FIELD_RE_TEMPLATE = r"(?im)^\s*[*-]?\s*\*\*{key}\*\*\s*[:：]\s*(.+?)\s*$"
_MAX_SHOTS = 120

_STORYBOARD_INJECTION = """
你是“分镜导演（Storyboard Director）”，负责将“分场剧本”拆解成可执行的镜头列表。
请严格按 JSON 输出，不要输出任何多余文字。

输出 JSON Schema:
{
  "shots": [
    {
      "shot_type": "大远景|远景|全景|中景|近景|特写|大特写|空镜（可选）",
      "camera_angle": "平视|俯视|仰视|侧拍|主观|过肩（可选）",
      "camera_move": "如 推/拉/摇/移/跟/升降/手持/静止（可选）",
      "description": "画面描述（必填，明确人物/动作/场景与视觉重点）",
      "dialogue": "对白（可选）",
      "dialogue_speaker": "说话人（可选）",
      "sound_effect": "音效/环境声（可选）",
      "duration_estimate": 0.0,
      "narrative_function": "建立|发展|高潮|转折|收尾（可选）",
      "pov_character": "主观视角角色（可选）",
      "filter_style": "滤镜/色彩/氛围（可选）",
      "active_assets": ["出镜资产名称或关键词（可选）"]
    }
  ]
}

规则:
1) shots 必须是数组，且至少包含 1 个元素
2) 分镜应覆盖分场内容的关键动作与信息点；避免遗漏对白与关键转折
3) description 要具体可拍：主体是谁、做什么、在哪里、镜头关注点是什么
4) 镜头语言要有节奏：开场建立(远/全) → 表演与信息(中/近/特) → 关键点(特写/反应) → 收束/过渡(空镜/远景)
5) 不确定的字段用 null
6) shots 数量不要超过 60 条，必要时合并相近镜头

分场信息:
<SCENE>
scene_code: {scene_code}
scene_number: {scene_number}
title: {title}
location: {location}
time_of_day: {time_of_day}
</SCENE>

分场剧本:
<SCENE_SCRIPT>
{scene_script}
</SCENE_SCRIPT>
""".strip()


def _build_final_prompt(*, prompt_template: str, scene_code: str, scene_number: int, title: str, location: str, time_of_day: str, scene_script: str) -> str:
    tpl = (prompt_template or "").strip()
    injected = (
        _STORYBOARD_INJECTION.replace("{scene_code}", (scene_code or "").strip())
        .replace("{scene_number}", str(scene_number))
        .replace("{title}", (title or "").strip())
        .replace("{location}", (location or "").strip())
        .replace("{time_of_day}", (time_of_day or "").strip())
        .replace("{scene_script}", (scene_script or "").strip())
    )
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


def _extract_md_field(block: str, key: str) -> str | None:
    if not block:
        return None
    pat = re.compile(_MD_FIELD_RE_TEMPLATE.format(key=re.escape(key)))
    m = pat.search(block)
    if not m:
        return None
    v = (m.group(1) or "").strip()
    return v or None


def _parse_shots_from_markdown(text: str) -> list[AIShotDraft]:
    t = (text or "").strip()
    if not t:
        return []
    matches = list(_SHOT_HEADER_RE.finditer(t))
    if not matches:
        return []
    out: list[AIShotDraft] = []
    for idx, m in enumerate(matches):
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(t)
        block = t[start:end]
        view = _extract_md_field(block, "景别/视角")
        shot_type: str | None = None
        camera_angle: str | None = None
        if view:
            v = view.replace("（", "(").replace("）", ")").strip()
            parts = [p.strip() for p in re.split(r"\s*/\s*", v) if p.strip()]
            if parts:
                m_paren = re.search(r"\(([^)]+)\)", parts[0])
                if m_paren:
                    camera_angle = (m_paren.group(1) or "").strip() or None
                shot_type = re.sub(r"\s*\([^)]*\)\s*$", "", parts[0]).strip() or parts[0]
            if len(parts) >= 2 and not camera_angle:
                camera_angle = parts[1] or None

        assets_line = _extract_md_field(block, "资产调用") or ""
        active_assets = [s.strip() for s in re.findall(r"@([0-9A-Za-z_\-\u4e00-\u9fff]+)", assets_line) if s.strip()]

        draft = AIShotDraft(
            shot_type=shot_type,
            camera_angle=camera_angle,
            narrative_function=_extract_md_field(block, "导演意图"),
            description=_extract_md_field(block, "画面内容描述"),
            dialogue=_extract_md_field(block, "对白/音效"),
            active_assets=active_assets,
        )
        if not (draft.description or draft.dialogue):
            continue
        out.append(draft)
        if len(out) >= _MAX_SHOTS:
            break
    return out


def _parse_shots_from_output(text: str) -> list[AIShotDraft]:
    try:
        json_text = _extract_json_text(text)
        if not json_text:
            raise ValueError("模型返回中未找到 JSON")
        data = json.loads(json_text)
        shots_payload: Any
        if isinstance(data, dict) and isinstance(data.get("shots"), list):
            shots_payload = data.get("shots")
        elif isinstance(data, list):
            shots_payload = data
        else:
            raise ValueError("JSON 格式不符合预期（需要 {shots:[...]} 或 [...]）")

        out: list[AIShotDraft] = []
        for item in shots_payload:
            if not isinstance(item, dict):
                continue
            draft = AIShotDraft.model_validate(item)
            if not (draft.description or draft.dialogue):
                continue
            out.append(draft)
            if len(out) >= _MAX_SHOTS:
                break
        if out:
            return out
        raise ValueError("未解析到有效分镜数据")
    except Exception:
        out_md = _parse_shots_from_markdown(text)
        if out_md:
            return out_md
        raise


async def _get_storyboard_and_episode_for_user(
    *,
    db: AsyncSession,
    user_id: UUID,
    storyboard_id: UUID,
) -> tuple[Storyboard, Episode] | None:
    result = await db.execute(
        select(Storyboard, Episode)
        .join(Episode, Storyboard.episode_id == Episode.id)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Storyboard.id == storyboard_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    row = result.first()
    if not row:
        return None
    storyboard, episode = row
    return storyboard, episode


async def _chat_completions(
    *,
    db: AsyncSession,
    user_id: UUID,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None,
    max_tokens: int | None,
) -> dict[str, Any]:
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

    raw = await ai_gateway_service.chat_text(
        db=db,
        user_id=user_id,
        binding_key=None,
        model_config_id=cfg.id,
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


class AIStoryboardService:
    async def build_prompt_preview(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        storyboard_id: UUID,
        prompt_template: str,
    ) -> str:
        pair = await _get_storyboard_and_episode_for_user(db=db, user_id=user_id, storyboard_id=storyboard_id)
        if not pair:
            raise AppError(msg="Storyboard not found or not authorized", code=404, status_code=404)
        storyboard, _episode = pair
        return _build_final_prompt(
            prompt_template=prompt_template,
            scene_code=storyboard.scene_code or "",
            scene_number=int(storyboard.scene_number or 0),
            title=storyboard.description or "", # Storyboard desc serves as scene content/title placeholder for now
            location=storyboard.location or "",
            time_of_day=storyboard.time_of_day or "",
            scene_script=storyboard.description or "", # Use description as content
        )

    async def preview(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        storyboard_id: UUID,
        model: str,
        prompt_template: str,
        temperature: float | None,
        max_tokens: int | None,
    ) -> tuple[str, str, list[AIShotDraft]]:
        pair = await _get_storyboard_and_episode_for_user(db=db, user_id=user_id, storyboard_id=storyboard_id)
        if not pair:
            raise AppError(msg="Storyboard not found or not authorized", code=404, status_code=404)
        storyboard, _episode = pair

        final_prompt = _build_final_prompt(
            prompt_template=prompt_template,
            scene_code=storyboard.scene_code or "",
            scene_number=int(storyboard.scene_number or 0),
            title=storyboard.description or "",
            location=storyboard.location or "",
            time_of_day=storyboard.time_of_day or "",
            scene_script=storyboard.description or "",
        )
        messages = [
            {"role": "system", "content": "你是一个严谨的分镜导演，只输出符合要求的 JSON。"},
            {"role": "user", "content": final_prompt},
        ]
        raw = await _chat_completions(
            db=db,
            user_id=user_id,
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        output_text = _extract_output_text(raw)
        shots = _parse_shots_from_output(output_text)
        return final_prompt, output_text, shots

    async def apply(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        storyboard_id: UUID,
        shots: list[AIShotDraft],
        mode: str,
    ) -> int:
        pair = await _get_storyboard_and_episode_for_user(db=db, user_id=user_id, storyboard_id=storyboard_id)
        if not pair:
            raise AppError(msg="Storyboard not found or not authorized", code=404, status_code=404)
        storyboard, episode = pair

        if mode not in {"replace", "append"}:
            raise AppError(msg="Invalid mode", code=400, status_code=400)
        if not shots:
            raise AppError(msg="No shots to apply", code=400, status_code=400)

        # In flattened structure, "applying" AI storyboard means splitting one Storyboard into multiple Storyboards
        # or replacing the current Storyboard with a sequence.
        # This logic needs to be adapted. 
        # Strategy:
        # If replace: Delete current storyboard, insert new ones in its place (requires handling shot_number sequence)
        # If append: Insert new ones after (requires handling shot_number sequence)
        
        # For simplicity in V1 refactor: We will insert new Storyboards and delete the original one if replace.
        
        # TODO: This needs robust renumbering logic which is complex.
        # For now, let's assume we just append new storyboards to the episode for the same scene group.
        
        # Get max shot number in the episode
        max_res = await db.execute(select(func.coalesce(func.max(Storyboard.shot_number), 0)).where(Storyboard.episode_id == episode.id))
        start_num = int(max_res.scalar_one() or 0)

        created_count = 0
        for idx, s in enumerate(shots, start=1):
            num = start_num + idx
            shot_code = f"EP{episode.episode_number:03d}_SC{storyboard.scene_number:02d}_SH{num:02d}"
            
            row = Storyboard(
                episode_id=episode.id,
                shot_code=shot_code,
                shot_number=num,
                scene_code=storyboard.scene_code,
                scene_number=storyboard.scene_number,
                
                shot_type=(s.shot_type or "").strip() or None,
                camera_move=(s.camera_move or "").strip() or None,
                narrative_function=(s.narrative_function or "").strip() or None,
                
                location=storyboard.location, # Inherit from parent
                location_type=storyboard.location_type,
                time_of_day=storyboard.time_of_day,
                
                description=(s.description or "").strip() or None,
                dialogue=(s.dialogue or "").strip() or None,
                duration_estimate=s.duration_estimate,
                active_assets=list(s.active_assets or []),
            )
            db.add(row)
            created_count += 1
            
        # If replace mode, we should delete the original storyboard acting as "Scene" placeholder
        if mode == "replace":
             await db.delete(storyboard)

        await db.commit()
        return created_count


ai_storyboard_service = AIStoryboardService()
