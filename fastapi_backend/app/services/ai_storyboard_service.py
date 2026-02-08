from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.models import Episode, Project, Scene, Script, Shot
from app.schemas import AIShotDraft
from app.services.llm_key_service import llm_key_service


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
_FIRST_JSON_RE = re.compile(r"(\{[\s\S]*\}|\[[\s\S]*\])")

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


def _parse_shots_from_output(text: str) -> list[AIShotDraft]:
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
    if not out:
        raise ValueError("未解析到有效分镜数据")
    return out


async def _get_scene_and_episode_for_user(
    *,
    db: AsyncSession,
    user_id: UUID,
    scene_id: UUID,
) -> tuple[Scene, Episode] | None:
    result = await db.execute(
        select(Scene, Episode)
        .join(Episode, Scene.episode_id == Episode.id)
        .join(Project, Episode.project_id == Project.id)
        .join(Script, Script.id == Project.id)
        .where(
            Scene.id == scene_id,
            Script.owner_id == user_id,
            Script.is_deleted.is_(False),
        )
    )
    row = result.first()
    if not row:
        return None
    scene, episode = row
    return scene, episode


async def _chat_completions(
    *,
    db: AsyncSession,
    user_id: UUID,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None,
    max_tokens: int | None,
) -> dict[str, Any]:
    token = await llm_key_service.get_or_issue_user_token(db=db, user_id=user_id, purpose="scene_storyboard")
    base_url = settings.LITELLM_BASE_URL.rstrip("/")
    url = f"{base_url}/chat/completions"
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": False}
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as client:
        try:
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM chat failed", code=502, status_code=502, data=str(e))
    return resp.json()


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
        scene_id: UUID,
        prompt_template: str,
    ) -> str:
        pair = await _get_scene_and_episode_for_user(db=db, user_id=user_id, scene_id=scene_id)
        if not pair:
            raise AppError(msg="Scene not found or not authorized", code=404, status_code=404)
        scene, _episode = pair
        return _build_final_prompt(
            prompt_template=prompt_template,
            scene_code=scene.scene_code,
            scene_number=int(scene.scene_number or 0),
            title=scene.title or "",
            location=scene.location or "",
            time_of_day=scene.time_of_day or "",
            scene_script=scene.content or "",
        )

    async def preview(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        scene_id: UUID,
        model: str,
        prompt_template: str,
        temperature: float | None,
        max_tokens: int | None,
    ) -> tuple[str, str, list[AIShotDraft]]:
        pair = await _get_scene_and_episode_for_user(db=db, user_id=user_id, scene_id=scene_id)
        if not pair:
            raise AppError(msg="Scene not found or not authorized", code=404, status_code=404)
        scene, _episode = pair

        final_prompt = _build_final_prompt(
            prompt_template=prompt_template,
            scene_code=scene.scene_code,
            scene_number=int(scene.scene_number or 0),
            title=scene.title or "",
            location=scene.location or "",
            time_of_day=scene.time_of_day or "",
            scene_script=scene.content or "",
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
        scene_id: UUID,
        shots: list[AIShotDraft],
        mode: str,
    ) -> int:
        pair = await _get_scene_and_episode_for_user(db=db, user_id=user_id, scene_id=scene_id)
        if not pair:
            raise AppError(msg="Scene not found or not authorized", code=404, status_code=404)
        scene, episode = pair

        if mode not in {"replace", "append"}:
            raise AppError(msg="Invalid mode", code=400, status_code=400)
        if not shots:
            raise AppError(msg="No shots to apply", code=400, status_code=400)

        start_num = 0
        if mode == "replace":
            await db.execute(delete(Shot).where(Shot.scene_id == scene.id))
        else:
            max_res = await db.execute(select(func.coalesce(func.max(Shot.shot_number), 0)).where(Shot.scene_id == scene.id))
            start_num = int(max_res.scalar_one() or 0)

        created_count = 0
        for idx, s in enumerate(shots, start=1):
            num = start_num + idx
            shot_code = f"EP{episode.episode_number:03d}_SC{scene.scene_number:02d}_SH{num:02d}"
            row = Shot(
                scene_id=scene.id,
                shot_code=shot_code,
                shot_number=num,
                shot_type=(s.shot_type or "").strip() or None,
                camera_angle=(s.camera_angle or "").strip() or None,
                camera_move=(s.camera_move or "").strip() or None,
                filter_style=(s.filter_style or "").strip() or None,
                narrative_function=(s.narrative_function or "").strip() or None,
                pov_character=(s.pov_character or "").strip() or None,
                description=(s.description or "").strip() or None,
                dialogue=(s.dialogue or "").strip() or None,
                dialogue_speaker=(s.dialogue_speaker or "").strip() or None,
                sound_effect=(s.sound_effect or "").strip() or None,
                active_assets=list(s.active_assets or []),
                duration_estimate=s.duration_estimate,
            )
            db.add(row)
            created_count += 1

        await db.commit()
        return created_count


ai_storyboard_service = AIStoryboardService()

