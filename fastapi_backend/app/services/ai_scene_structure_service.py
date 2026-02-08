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
from app.models import Episode, Project, Scene, Script
from app.schemas import AISceneDraft
from app.services.llm_key_service import llm_key_service
from app.services.llm_model_service import llm_model_service


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


def _split_provider_model(model: str) -> tuple[str, str]:
    raw = (model or "").strip()
    if not raw:
        return "unknown", ""
    if "/" not in raw:
        return raw, raw
    provider, rest = raw.split("/", 1)
    return provider.strip() or "unknown", rest.strip()


def _allowed_models() -> list[str]:
    raw = (settings.LITELLM_DEFAULT_ALLOWED_MODELS or "").strip()
    if not raw:
        return []
    return [m.strip() for m in raw.split(",") if m.strip()]


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
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None,
    max_tokens: int | None,
) -> dict[str, Any]:
    token = await llm_key_service.get_or_issue_user_token(db=db, user_id=user_id, purpose="episode_scene_structure")
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


class AISceneStructureService:
    async def _list_litellm_model_names(self) -> list[dict[str, str]] | None:
        if not settings.LITELLM_MASTER_KEY:
            return None
        res = await llm_model_service.list_models()
        data = res.get("data")
        if not isinstance(data, list):
            return []

        out: list[dict[str, str]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            model_name = str(item.get("model_name") or "").strip()
            if not model_name:
                continue
            litellm_params = item.get("litellm_params")
            internal_model = ""
            if isinstance(litellm_params, dict):
                internal_model = str(litellm_params.get("model") or "").strip()
            provider, _ = _split_provider_model(model_name)
            if provider == model_name and "/" not in model_name and internal_model:
                provider, _ = _split_provider_model(internal_model)
            out.append({"provider": provider, "model": model_name})
        return out

    async def list_models(self) -> list[dict[str, str]]:
        litellm_models = await self._list_litellm_model_names()
        if litellm_models is not None:
            return litellm_models
        models = _allowed_models()
        out: list[dict[str, str]] = []
        for m in models:
            provider, _ = _split_provider_model(m)
            out.append({"provider": provider, "model": m})
        return out

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
        litellm_models = await self._list_litellm_model_names()
        if litellm_models is not None:
            available = {m["model"] for m in litellm_models if m.get("model")}
            if available and model not in available:
                raise AppError(msg="Model not found", code=400, status_code=400)
        else:
            models = _allowed_models()
            if models and model not in models:
                raise AppError(msg="Model not allowed", code=400, status_code=400)

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
            model=model,
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
            await db.execute(delete(Scene).where(Scene.episode_id == episode.id))
        else:
            max_res = await db.execute(
                select(func.coalesce(func.max(Scene.scene_number), 0)).where(Scene.episode_id == episode.id)
            )
            start_num = int(max_res.scalar_one() or 0)

        ordered = list(scenes)
        if all(s.scene_number is not None for s in ordered):
            ordered.sort(key=lambda s: int(s.scene_number or 0))

        created_count = 0
        for idx, s in enumerate(ordered, start=1):
            num = start_num + idx
            code = f"EP{episode.episode_number:03d}_SC{num:02d}"
            row = Scene(
                episode_id=episode.id,
                scene_code=code,
                scene_number=num,
                title=(s.title or "").strip() or None,
                content=(s.content or "").strip() or None,
                location=(s.location or "").strip() or None,
                time_of_day=(s.time_of_day or "").strip() or None,
                location_type=s.location_type,
            )
            db.add(row)
            created_count += 1

        await db.commit()
        return created_count


ai_scene_structure_service = AISceneStructureService()
