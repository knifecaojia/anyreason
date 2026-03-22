"""Regression tests for pydanticai_model_factory.

Ensures resolve_text_model_for_pydantic_ai correctly handles
4-value return from _resolve_model_config.
"""
from types import SimpleNamespace
from uuid import UUID

import pytest


@pytest.mark.asyncio
async def test_resolve_text_model_for_pydantic_ai_handles_four_value_return(monkeypatch):
    """Regression test: ensure wrapper handles 4-value _resolve_model_config return.

    This test verifies the fix for:
    ValueError: too many values to unpack (expected 3)

    The bug occurred because _resolve_model_config returns 4 values:
    (cfg, cfg_id, resolved_binding_key, slot_acquisition_result)
    but the wrapper was unpacking only 3 values.
    """
    from app.ai_runtime.pydanticai_model_factory import (
        resolve_text_model_for_pydantic_ai,
        PydanticAIResolvedModel,
    )
    from app.ai_gateway import ai_gateway_service

    # Mock _resolve_model_config to return a 4-tuple (simulating real behavior)
    async def _mock_resolve_model_config(
        *,
        db,
        category,
        binding_key,
        model_config_id,
        default_binding_key,
        skip_slot_acquisition=False,
        allow_queue=False,
    ):
        _ = (db, category, binding_key, model_config_id, default_binding_key, skip_slot_acquisition, allow_queue)
        
        # Return 4 values as the real implementation does
        cfg = SimpleNamespace(
            model="gpt-4o-mini",
            base_url="https://api.example.com/v1",
            api_key="sk-test-key",
        )
        cfg_id = UUID("12345678-1234-1234-1234-123456789abc")
        resolved_binding_key = "chatbox"
        slot_acquisition_result = {"queued": False, "api_key": "sk-test-key"}
        
        return (cfg, cfg_id, resolved_binding_key, slot_acquisition_result)

    # Apply the monkeypatch to the service method
    monkeypatch.setattr(
        ai_gateway_service,
        "_resolve_model_config",
        _mock_resolve_model_config,
    )

    # Create a mock db session (not used by the mock, but required by signature)
    mock_db = SimpleNamespace()

    # Call the function under test
    result = await resolve_text_model_for_pydantic_ai(
        db=mock_db,
        binding_key="chatbox",
        ai_model_config_id=UUID("12345678-1234-1234-1234-123456789abc"),
    )

    # Assert the result is correct
    assert isinstance(result, PydanticAIResolvedModel)
    assert result.model_name == "gpt-4o-mini"
    assert result.base_url == "https://api.example.com/v1"
    assert result.api_key == "sk-test-key"
    assert result.ai_model_config_id == UUID("12345678-1234-1234-1234-123456789abc")
    assert result.binding_key == "chatbox"


@pytest.mark.asyncio
async def test_resolve_text_model_for_pydantic_ai_handles_queued_slot(monkeypatch):
    """Test that wrapper works even when slot_acquisition_result indicates queued state."""
    from app.ai_runtime.pydanticai_model_factory import (
        resolve_text_model_for_pydantic_ai,
        PydanticAIResolvedModel,
    )
    from app.ai_gateway import ai_gateway_service

    async def _mock_resolve_model_config_with_queue(
        *,
        db,
        category,
        binding_key,
        model_config_id,
        default_binding_key,
        skip_slot_acquisition=False,
        allow_queue=False,
    ):
        _ = (db, category, binding_key, model_config_id, default_binding_key, skip_slot_acquisition, allow_queue)
        
        cfg = SimpleNamespace(
            model="qwen-max",
            base_url="https://dashscope.aliyuncs.com/v1",
            api_key="sk-queued-test",
        )
        cfg_id = UUID("87654321-4321-4321-4321-cba987654321")
        resolved_binding_key = "chatbox"
        # Simulate a queued slot result
        slot_acquisition_result = {
            "queued": True,
            "queue_position": 5,
            "owner_token": "test-token",
        }
        
        return (cfg, cfg_id, resolved_binding_key, slot_acquisition_result)

    monkeypatch.setattr(
        ai_gateway_service,
        "_resolve_model_config",
        _mock_resolve_model_config_with_queue,
    )

    mock_db = SimpleNamespace()

    result = await resolve_text_model_for_pydantic_ai(
        db=mock_db,
        binding_key="chatbox",
        ai_model_config_id=UUID("87654321-4321-4321-4321-cba987654321"),
    )

    assert isinstance(result, PydanticAIResolvedModel)
    assert result.model_name == "qwen-max"
    assert result.base_url == "https://dashscope.aliyuncs.com/v1"
    assert result.api_key == "sk-queued-test"
    assert result.ai_model_config_id == UUID("87654321-4321-4321-4321-cba987654321")
    assert result.binding_key == "chatbox"


@pytest.mark.asyncio
async def test_resolve_text_model_for_pydantic_ai_handles_skip_slot_acquisition(monkeypatch):
    """Test that wrapper works when slot_acquisition_result is None (skip_slot_acquisition=True)."""
    from app.ai_runtime.pydanticai_model_factory import (
        resolve_text_model_for_pydantic_ai,
        PydanticAIResolvedModel,
    )
    from app.ai_gateway import ai_gateway_service

    async def _mock_resolve_model_config_skip_slot(
        *,
        db,
        category,
        binding_key,
        model_config_id,
        default_binding_key,
        skip_slot_acquisition=False,
        allow_queue=False,
    ):
        _ = (db, category, binding_key, model_config_id, default_binding_key, skip_slot_acquisition, allow_queue)
        
        cfg = SimpleNamespace(
            model="doubao-pro",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key="sk-skip-slot",
        )
        cfg_id = UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        resolved_binding_key = "chatbox"
        # When skip_slot_acquisition=True, the 4th value is None
        slot_acquisition_result = None
        
        return (cfg, cfg_id, resolved_binding_key, slot_acquisition_result)

    monkeypatch.setattr(
        ai_gateway_service,
        "_resolve_model_config",
        _mock_resolve_model_config_skip_slot,
    )

    mock_db = SimpleNamespace()

    result = await resolve_text_model_for_pydantic_ai(
        db=mock_db,
        binding_key="chatbox",
        ai_model_config_id=UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    )

    assert isinstance(result, PydanticAIResolvedModel)
    assert result.model_name == "doubao-pro"
    assert result.base_url == "https://ark.cn-beijing.volces.com/api/v3"
    assert result.api_key == "sk-skip-slot"
    assert result.ai_model_config_id == UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    assert result.binding_key == "chatbox"
