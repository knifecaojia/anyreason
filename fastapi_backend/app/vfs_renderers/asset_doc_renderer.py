from __future__ import annotations

import importlib.resources
import json

from app.vfs_docs import AssetDocV2


_ASSET_DOC_TEMPLATE: str | None = None


def _get_asset_doc_template() -> str:
    global _ASSET_DOC_TEMPLATE
    if _ASSET_DOC_TEMPLATE is not None:
        return _ASSET_DOC_TEMPLATE
    text = importlib.resources.files("app.vfs_templates").joinpath("asset_doc.md").read_text(encoding="utf-8")
    _ASSET_DOC_TEMPLATE = text
    return text


def render_asset_doc_md(*, doc: AssetDocV2) -> str:
    tpl = _get_asset_doc_template()
    out = tpl
    out = out.replace("{{asset_type}}", str(doc.type))
    out = out.replace("{{name}}", (doc.name or "").replace("\n", " ").strip())
    out = out.replace("{{keywords}}", json.dumps(list(doc.keywords or []), ensure_ascii=False))
    out = out.replace("{{first_appearance_episode}}", "null" if doc.first_appearance_episode is None else str(int(doc.first_appearance_episode)))
    out = out.replace("{{provenance_json}}", json.dumps(dict(doc.provenance or {}), ensure_ascii=False))
    out = out.replace("{{details_md}}", (doc.details_md or "").strip())
    return out.rstrip() + "\n"
