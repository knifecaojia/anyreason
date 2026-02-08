from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import Integer, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.models import (
    Asset,
    AssetBinding,
    AssetTag,
    AssetTagRelation,
    AssetVariant,
    Episode,
    Project,
    Script,
)
from app.schemas import AIAssetDraft, AIAssetVariantDraft, AIWorldUnityDraft
from app.services.llm_key_service import llm_key_service
from app.services.llm_model_service import llm_model_service


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
_FIRST_JSON_RE = re.compile(r"(\{[\s\S]*\}|\[[\s\S]*\])")


_ASSET_EXTRACTION_INJECTION = """
你将从“剧集剧本正文”中抽取并补全可用于漫剧生产管线的标准化视觉资产数据。你必须先构建“世界观统一要素”，再抽取各类资产（角色/场景/道具/特效），并进行导演级视觉补全。请严格按 JSON 输出，不要输出任何多余文字。

关键原则（必须执行）：
1) 剧本没写的视觉细节必须补全，剧本写了的必须视觉化；禁止反问用户
2) 只写视觉信息，禁止写抽象能力/年龄/情绪（例如“很强/很悲伤”），必须转成可视化描述
3) 角色资产默认 CKB 建库标准：A-pose 或 T-pose，中立表情，不要包含任何情境动作（跑步/哭泣/吃东西等）
4) 主角团必须具备高辨识度；除非剧本明确要求，否则避免普通“黑发黑瞳”，可采用概念化高对比配色
5) 角色形态优先用 variants 表达（例如：林夜（伪装形态）），而不是拆成多个资产实体

输出 JSON Schema（示意）：
{
  "world_unity": {
    "production_title": "作品名称",
    "era_setting": "时代背景",
    "unified_emblem": "统一标识",
    "base_costume": "基础服装架构",
    "color_system": "主色/辅色/点缀色",
    "material_style": "材质风格",
    "lighting_style": "光线风格",
    "art_style": "艺术风格",
    "notes": "其他统一约束"
  },
  "assets": [
    {
      "type": "character|scene|prop|vfx",
      "name": "资产名称",
      "importance": "main|support|minor",
      "category_path": ["分类层级1", "分类层级2"],
      "tags": ["标签1", "标签2"],
      "concept": "一句话视觉概念设定",
      "visual_details": { "D1": "...", "D2": "...", "D3": "...", "D4": "...", "D5": "...", "D6": "...", "D7": "..." },
      "prompt_en": "英文Prompt（融合世界观统一要素与该资产细节）",
      "variants": [
        {
          "variant_code": "V1",
          "stage_tag": "可选",
          "attributes": { "extra": "..." },
          "prompt_en": "该形态的英文Prompt（可选，缺省使用父级prompt_en）"
        }
      ],
      "children": []
    }
  ]
}

规则：
1) 顶层必须是 JSON 对象，且必须包含 world_unity 与 assets 两个 key
2) world_unity 必须是对象（允许空对象 {}），不要输出 null
3) assets 必须是数组，且至少 1 个元素；不要输出 null
4) 每个 asset 必须包含：type 与 name
5) type 必须是以下 4 个小写之一：character | scene | prop | vfx（不要输出 CHARACTER/SCENE/PROP/VFX 或中文）
6) category_path/tags/variants/children 必须是数组；如无内容，输出 []；不要输出 null
7) importance 如无法判断，省略该字段或输出 null（不要输出“主角/配角”这种非枚举值）
8) prompt_en 使用英文，聚焦外观/材质/光影/构图，不要写故事解说
9) character 的 prompt_en 必须包含：Art Style、Hair Style/Color、Eye Shape/Color、Costume Details、A-pose/T-pose、Neutral Expression
10) scene 的 prompt_en 必须包含：Art Style、Foreground/Midground/Background、Lighting、Atmosphere
11) prop/vfx 的 prompt_en 必须包含：Art Style、Material、Shape/Color、Key details

剧集剧本正文：
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
    injected = _ASSET_EXTRACTION_INJECTION.replace("{episode_script}", (episode_script or "").strip())
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


def _extract_output_text(raw: dict[str, Any]) -> str:
    try:
        return raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    except Exception:
        return ""


def _parse_sse_lines_to_text(lines: list[str]) -> str:
    out: list[str] = []
    for line in lines:
        if not line:
            continue
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data:
            continue
        if data == "[DONE]":
            break
        try:
            obj = json.loads(data)
        except Exception:
            continue
        if not isinstance(obj, dict):
            continue
        choices = obj.get("choices")
        if not isinstance(choices, list) or not choices:
            continue
        first = choices[0]
        if not isinstance(first, dict):
            continue
        delta = first.get("delta")
        message = first.get("message")
        piece = ""
        if isinstance(delta, dict):
            piece = str(delta.get("content") or delta.get("text") or "")
        if not piece and isinstance(message, dict):
            piece = str(message.get("content") or "")
        if piece:
            out.append(piece)
    return "".join(out)


def _normalize_asset_type(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    v = raw.lower()
    if v in {"character", "char", "角色", "人物"}:
        return "character"
    if v in {"scene", "scn", "场景"}:
        return "scene"
    if v in {"prop", "道具", "物件"}:
        return "prop"
    if v in {"vfx", "特效"}:
        return "vfx"
    if v in {"character", "scene", "prop", "vfx"}:
        return v
    if v == "character".lower() or raw == "CHARACTER":
        return "character"
    if raw == "SCENE":
        return "scene"
    if raw == "PROP":
        return "prop"
    if raw == "VFX":
        return "vfx"
    return None


def _coerce_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        s = re.sub(r"\s+", " ", value.strip())
        return [s] if s else []
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for it in value:
        if it is None:
            continue
        s = re.sub(r"\s+", " ", str(it).strip())
        if s:
            out.append(s)
    return out


def _sanitize_asset_dict(item: dict[str, Any]) -> dict[str, Any]:
    out = dict(item)
    out["type"] = _normalize_asset_type(out.get("type")) or out.get("type")
    out["name"] = re.sub(r"\s+", " ", str(out.get("name") or "").strip())

    if out.get("importance") not in {"main", "support", "minor", None}:
        out["importance"] = None

    out["category_path"] = _coerce_str_list(out.get("category_path"))
    out["tags"] = _coerce_str_list(out.get("tags"))

    variants = out.get("variants")
    if variants is None:
        out["variants"] = []
    elif isinstance(variants, dict):
        out["variants"] = [variants]
    elif isinstance(variants, list):
        out["variants"] = [v for v in variants if isinstance(v, dict)]
    else:
        out["variants"] = []

    children = out.get("children")
    if children is None:
        out["children"] = []
    elif isinstance(children, dict):
        out["children"] = [_sanitize_asset_dict(children)]
    elif isinstance(children, list):
        out["children"] = [_sanitize_asset_dict(c) for c in children if isinstance(c, dict)]
    else:
        out["children"] = []

    return out


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def _asset_prefix(asset_type: str) -> str:
    if asset_type == "character":
        return "CHAR"
    if asset_type == "scene":
        return "SCN"
    if asset_type == "prop":
        return "PROP"
    return "VFX"


def _join_category_path(path: list[str]) -> str | None:
    cleaned = [re.sub(r"\s+", " ", (p or "").strip()) for p in (path or []) if (p or "").strip()]
    if not cleaned:
        return None
    return "/".join(cleaned)[:50]


def _flatten_assets(items: list[AIAssetDraft]) -> list[AIAssetDraft]:
    out: list[AIAssetDraft] = []

    def _walk(node: AIAssetDraft) -> None:
        out.append(node)
        for ch in node.children or []:
            _walk(ch)

    for it in items:
        _walk(it)
    return out


def _select_default_variant(variants: list[AssetVariant]) -> AssetVariant | None:
    if not variants:
        return None
    by_code = {v.variant_code: v for v in variants if v.variant_code}
    if "V1" in by_code:
        return by_code["V1"]
    for v in variants:
        if v.is_default:
            return v
    return variants[0]


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
    token = await llm_key_service.get_or_issue_user_token(db=db, user_id=user_id, purpose="episode_asset_extraction")
    base_url = (settings.LITELLM_BASE_URL or "").strip().rstrip("/")
    if not base_url:
        raise AppError(msg="LiteLLM base url not configured", code=500, status_code=500, data={"key": "LITELLM_BASE_URL"})
    url = f"{base_url}/chat/completions"
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    timeout = httpx.Timeout(connect=10.0, read=240.0, write=30.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream(
                "POST",
                url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            ) as resp:
                if resp.status_code >= 400:
                    body = ""
                    try:
                        body = await resp.aread()
                        body = body.decode("utf-8", errors="ignore")
                    except Exception:
                        body = ""
                    raise AppError(
                        msg="LiteLLM chat failed",
                        code=502,
                        status_code=502,
                        data={"status_code": resp.status_code, "body": (body or "")[:2000], "model": model, "url": url},
                    )

                content_type = (resp.headers.get("content-type") or "").lower()
                if "text/event-stream" in content_type:
                    lines = [line async for line in resp.aiter_lines()]
                    content = _parse_sse_lines_to_text(lines)
                    return {"choices": [{"message": {"content": content}}]}

                body_bytes = await resp.aread()
                body_text = body_bytes.decode("utf-8", errors="ignore")
                if body_text.lstrip().startswith("data:"):
                    content = _parse_sse_lines_to_text(body_text.splitlines())
                    return {"choices": [{"message": {"content": content}}]}

                return json.loads(body_text) if body_text else {}
        except httpx.TimeoutException as e:
            raise AppError(
                msg="LiteLLM chat timeout",
                code=504,
                status_code=504,
                data={"error": repr(e), "model": model, "url": url},
            )
        except httpx.HTTPError as e:
            raise AppError(msg="LiteLLM chat failed", code=502, status_code=502, data={"error": repr(e), "model": model, "url": url})


def _parse_assets_from_output(text: str) -> tuple[AIWorldUnityDraft | None, list[AIAssetDraft]]:
    json_text = _extract_json_text(text)
    if not json_text:
        raise ValueError("模型返回中未找到 JSON")
    data = json.loads(json_text)
    world_unity: AIWorldUnityDraft | None = None
    assets_payload: Any = None

    if isinstance(data, dict):
        wu = data.get("world_unity")
        if isinstance(wu, dict):
            world_unity = AIWorldUnityDraft.model_validate(wu)
        ap = data.get("assets")
        if isinstance(ap, list):
            assets_payload = ap
    elif isinstance(data, list):
        assets_payload = data

    if not isinstance(assets_payload, list):
        raise ValueError("JSON 格式不符合预期（需要 {assets:[...]} 或 [...]）")

    out: list[AIAssetDraft] = []
    for item in assets_payload:
        if not isinstance(item, dict):
            continue
        draft = AIAssetDraft.model_validate(_sanitize_asset_dict(item))
        if not (draft.name and draft.type):
            continue
        out.append(draft)
    if not out:
        raise ValueError("未解析到有效资产数据")
    return world_unity, out


class AIAssetExtractionService:
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
    ) -> tuple[str, str, AIWorldUnityDraft | None, list[AIAssetDraft]]:
        litellm_models = await self._list_litellm_model_names()
        if litellm_models is not None:
            available = {m["model"] for m in litellm_models if m.get("model")}
            if available and model not in available:
                raise AppError(msg="Model not found", code=400, status_code=400)
        else:
            models = _allowed_models()
            if models and model not in models:
                raise AppError(msg="Model not found", code=400, status_code=400)

        episode = await _get_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
        if not episode:
            raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)

        final_prompt = _build_final_prompt(prompt_template=prompt_template, episode_script=episode.script_full_text or "")
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": "You are a careful assistant. Output only valid JSON."},
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
        raw_text = _extract_output_text(raw)
        try:
            world_unity, assets = _parse_assets_from_output(raw_text)
        except Exception as e:
            raise AppError(msg="Failed to parse asset extraction output", code=502, status_code=502, data=str(e))
        return final_prompt, raw_text, world_unity, assets

    async def apply(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        episode_id: UUID,
        mode: str,
        world_unity: AIWorldUnityDraft | None,
        assets: list[AIAssetDraft],
    ) -> dict[str, int]:
        episode = await _get_episode_for_user(db=db, user_id=user_id, episode_id=episode_id)
        if not episode:
            raise AppError(msg="Episode not found or not authorized", code=404, status_code=404)
        if not episode.project_id:
            raise AppError(msg="Episode project not found", code=400, status_code=400)
        project_id = episode.project_id

        if mode == "replace":
            await db.execute(delete(AssetBinding).where(AssetBinding.episode_id == episode_id))

        flattened = _flatten_assets(assets)

        assets_created = 0
        assets_reused = 0
        variants_created = 0
        bindings_created = 0
        tags_created = 0
        tag_relations_created = 0

        tag_cache: dict[str, AssetTag] = {}

        async def _get_or_create_tag(name: str) -> AssetTag:
            norm = re.sub(r"\s+", " ", (name or "").strip())
            if not norm:
                raise ValueError("Empty tag")
            key = norm.lower()
            if key in tag_cache:
                return tag_cache[key]
            existing = (
                await db.execute(
                    select(AssetTag).where(AssetTag.project_id == project_id, func.lower(AssetTag.name) == key)
                )
            ).scalars().first()
            if existing:
                tag_cache[key] = existing
                return existing
            created = AssetTag(project_id=project_id, name=norm)
            db.add(created)
            await db.flush()
            tag_cache[key] = created
            nonlocal tags_created
            tags_created += 1
            return created

        async def _next_asset_seq(prefix: str) -> int:
            digits = func.substring(Asset.asset_id, r"(\d+)$")
            res = await db.execute(
                select(func.max(func.cast(digits, Integer))).where(
                    Asset.project_id == project_id,
                    Asset.asset_id.like(f"{prefix}_%"),
                )
            )
            max_val = res.scalar_one_or_none()
            return (int(max_val) if max_val is not None else 0) + 1

        seq_cache: dict[str, int] = {}

        async def _alloc_asset_id(asset_type: str) -> str:
            prefix = _asset_prefix(asset_type)
            if prefix not in seq_cache:
                seq_cache[prefix] = await _next_asset_seq(prefix)
            n = seq_cache[prefix]
            seq_cache[prefix] = n + 1
            return f"{prefix}_{n:03d}"

        for draft in flattened:
            name = re.sub(r"\s+", " ", (draft.name or "").strip())
            if not name:
                continue
            asset_type = draft.type
            norm_name = _normalize_name(name)

            existing_asset = (
                await db.execute(
                    select(Asset).where(
                        Asset.project_id == project_id,
                        Asset.type == asset_type,
                        func.lower(Asset.name) == norm_name,
                    )
                )
            ).scalars().first()
            asset: Asset
            if existing_asset:
                asset = existing_asset
                assets_reused += 1
            else:
                asset = Asset(
                    project_id=project_id,
                    asset_id=await _alloc_asset_id(asset_type),
                    name=name[:100],
                    type=asset_type,
                    category=_join_category_path(draft.category_path),
                )
                db.add(asset)
                await db.flush()
                assets_created += 1

            tags = set([t for t in (draft.tags or []) if (t or "").strip()])
            tags.update([p for p in (draft.category_path or []) if (p or "").strip()])
            for t in tags:
                tag = await _get_or_create_tag(t)
                existing_rel = (
                    await db.execute(
                        select(AssetTagRelation).where(
                            AssetTagRelation.asset_entity_id == asset.id,
                            AssetTagRelation.tag_id == tag.id,
                        )
                    )
                ).scalars().first()
                if existing_rel:
                    continue
                db.add(AssetTagRelation(asset_entity_id=asset.id, tag_id=tag.id))
                tag_relations_created += 1

            variant_drafts: list[AIAssetVariantDraft] = list(draft.variants or [])
            if not variant_drafts:
                variant_drafts = [AIAssetVariantDraft(variant_code="V1", prompt_en=draft.prompt_en)]

            created_variants: list[AssetVariant] = []
            for vd in variant_drafts:
                vcode = (vd.variant_code or "V1").strip()[:20] or "V1"
                existing_variant = (
                    await db.execute(
                        select(AssetVariant).where(
                            AssetVariant.asset_entity_id == asset.id,
                            AssetVariant.variant_code == vcode,
                        )
                    )
                ).scalars().first()
                attrs: dict[str, Any] = {}
                if world_unity is not None:
                    attrs["world_unity"] = world_unity.model_dump(exclude_none=True)
                if draft.concept:
                    attrs["concept"] = draft.concept
                if draft.visual_details:
                    attrs["visual_details"] = draft.visual_details
                if draft.importance:
                    attrs["importance"] = draft.importance
                if isinstance(vd.attributes, dict):
                    attrs.update(vd.attributes)

                prompt_en = (vd.prompt_en or draft.prompt_en or "").strip()

                if existing_variant:
                    existing_variant.prompt_template = prompt_en or existing_variant.prompt_template
                    existing_variant.attributes = attrs or existing_variant.attributes
                    if vd.stage_tag:
                        existing_variant.stage_tag = vd.stage_tag[:50]
                    created_variants.append(existing_variant)
                    continue

                variant = AssetVariant(
                    asset_entity_id=asset.id,
                    variant_code=vcode,
                    stage_tag=(vd.stage_tag or episode.stage_tag or None),
                    attributes=attrs,
                    prompt_template=prompt_en,
                    is_default=False,
                )
                db.add(variant)
                await db.flush()
                variants_created += 1
                created_variants.append(variant)

            default_variant = _select_default_variant(created_variants)
            for v in created_variants:
                v.is_default = default_variant is not None and v.id == default_variant.id

            existing_binding = (
                await db.execute(
                    select(AssetBinding).where(
                        AssetBinding.episode_id == episode_id,
                        AssetBinding.asset_entity_id == asset.id,
                    )
                )
            ).scalars().first()
            state: dict[str, Any] = {"source": "ai_asset_extraction"}
            if draft.importance:
                state["importance"] = draft.importance
            if world_unity is not None:
                state["world_unity"] = world_unity.model_dump(exclude_none=True)
            if existing_binding:
                existing_binding.asset_variant_id = (default_variant.id if default_variant else existing_binding.asset_variant_id)
                existing_binding.state = state
            else:
                db.add(
                    AssetBinding(
                        episode_id=episode_id,
                        asset_entity_id=asset.id,
                        asset_variant_id=default_variant.id if default_variant else None,
                        state=state,
                    )
                )
                bindings_created += 1

        await db.commit()
        return {
            "assets_created": assets_created,
            "assets_reused": assets_reused,
            "variants_created": variants_created,
            "bindings_created": bindings_created,
            "tags_created": tags_created,
            "tag_relations_created": tag_relations_created,
        }


ai_asset_extraction_service = AIAssetExtractionService()
