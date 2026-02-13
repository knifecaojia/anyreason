def test_ai_runtime_imports():
    from app.ai_runtime import pydantic_ai_available

    assert isinstance(pydantic_ai_available(), bool)

