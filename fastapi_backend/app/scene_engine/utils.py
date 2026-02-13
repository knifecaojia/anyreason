from __future__ import annotations

import json
from typing import Any


def extract_chat_completion_text(raw: dict[str, Any]) -> str:
    try:
        return raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    except Exception:
        return ""


def strip_code_fences(text: str) -> str:
    s = (text or "").strip()
    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    return s


def parse_json_object(text: str) -> Any:
    return json.loads(strip_code_fences(text))

