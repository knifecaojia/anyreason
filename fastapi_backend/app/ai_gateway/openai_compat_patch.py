from __future__ import annotations

import sys
from typing import Any, Callable

_original_model_dump: Callable[..., Any] | None = None
_patched_model_dump: Callable[..., Any] | None = None


def _create_patched_model_dump(original: Callable[..., Any]) -> Callable[..., Any]:
    def _patched_model_dump(obj: Any, /, *args: Any, **kwargs: Any) -> Any:
        if kwargs.get("by_alias") is None:
            kwargs["by_alias"] = True
        return original(obj, *args, **kwargs)

    return _patched_model_dump


def ensure_openai_compat_patched() -> None:
    global _original_model_dump, _patched_model_dump

    try:
        import openai._compat as compat
    except Exception:
        return

    current_model_dump: Callable[..., Any] | None = getattr(compat, "model_dump", None)
    if current_model_dump is None or not callable(current_model_dump):
        return

    if _patched_model_dump is not None and current_model_dump is _patched_model_dump:
        return

    if _original_model_dump is None:
        _original_model_dump = current_model_dump

    _patched_model_dump = _create_patched_model_dump(_original_model_dump)
    setattr(compat, "model_dump", _patched_model_dump)

    for module_name, module in list(sys.modules.items()):
        if not module_name.startswith("openai."):
            continue
        if module is None:
            continue
        try:
            candidate = getattr(module, "model_dump", None)
        except Exception:
            continue
        if candidate is _original_model_dump:
            try:
                setattr(module, "model_dump", _patched_model_dump)
            except Exception:
                continue
