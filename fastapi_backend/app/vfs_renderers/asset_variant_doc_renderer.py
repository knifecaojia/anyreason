from __future__ import annotations

import importlib.resources
import json

from app.vfs_docs import AssetDocV2


_ASSET_VARIANT_DOC_TEMPLATE: str | None = None


def _get_asset_variant_doc_template() -> str:
    global _ASSET_VARIANT_DOC_TEMPLATE
    if _ASSET_VARIANT_DOC_TEMPLATE is not None:
        return _ASSET_VARIANT_DOC_TEMPLATE
    text = importlib.resources.files("app.vfs_templates").joinpath("asset_variant_doc.md").read_text(encoding="utf-8")
    _ASSET_VARIANT_DOC_TEMPLATE = text
    return text


def render_asset_variant_doc_md(
    *,
    asset_type: str,
    asset_name: str,
    variant_code: str,
    stage_tag: str | None,
    age_range: str | None,
    attributes: dict,
    prompt_template: str | None,
) -> str:
    tpl = _get_asset_variant_doc_template()
    out = tpl
    
    variant_label = stage_tag or variant_code or "默认变体"
    
    out = out.replace("{{asset_type}}", str(asset_type))
    out = out.replace("{{asset_name}}", (asset_name or "").replace("\n", " ").strip())
    out = out.replace("{{variant_code}}", (variant_code or "").strip())
    out = out.replace("{{variant_label}}", variant_label)
    out = out.replace("{{stage_tag}}", (stage_tag or "-"))
    out = out.replace("{{age_range}}", (age_range or "-"))
    out = out.replace("{{attributes_json}}", json.dumps(dict(attributes or {}), ensure_ascii=False, indent=2))
    out = out.replace("{{prompt_template}}", (prompt_template or "暂无提示词模板").strip())
    
    return out.rstrip() + "\n"
