from __future__ import annotations


def test_openai_compat_patch_with_real_module():
    """Test that the patch correctly handles by_alias=None with the real openai module."""
    import openai._compat as compat

    from app.ai_gateway.openai_compat_patch import ensure_openai_compat_patched
    from pydantic import BaseModel

    class TestModel(BaseModel):
        name: str

    ensure_openai_compat_patched()

    model = TestModel(name="test")

    result = compat.model_dump(model, by_alias=None)
    assert result == {"name": "test"}

    result2 = compat.model_dump(model)
    assert result2 == {"name": "test"}

    result3 = compat.model_dump(model, by_alias=True)
    assert result3 == {"name": "test"}

    result4 = compat.model_dump(model, by_alias=False)
    assert result4 == {"name": "test"}


def test_patch_is_idempotent():
    """Test that calling ensure_openai_compat_patched multiple times is safe."""
    from app.ai_gateway.openai_compat_patch import ensure_openai_compat_patched

    ensure_openai_compat_patched()
    ensure_openai_compat_patched()
    ensure_openai_compat_patched()

    import openai._compat as compat

    from pydantic import BaseModel

    class TestModel(BaseModel):
        value: int

    model = TestModel(value=42)

    result = compat.model_dump(model, by_alias=None)
    assert result == {"value": 42}
