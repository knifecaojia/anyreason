# Task 1: Missing Path Check

**Generated:** 2026-03-22  
**Task:** Audit all resource-consuming AI entry points  

## Purpose

This document explicitly calls out any unmapped, ambiguous, or backend-only charging paths that may cause gaps in the credits system integration.

---

## Unmapped / Ambiguous Paths

### 1. ⚠️ `submit_media_async()` Hardcoded Pricing
**File:** `fastapi_backend/app/ai_gateway/service.py:597`

**Issue:** The credits cost is hardcoded instead of using `credit_price_service`:
```python
credits_cost = 10 if category == "video" else 5
```

**Impact:**
- Uses hardcoded values instead of model-specific pricing
- If a video model is configured with custom pricing (e.g., 100 credits), the user will only be charged 10
- Potential revenue leakage or cross-subsidy

**Recommendation:** Replace with:
```python
credits_cost = credit_price_service.get_cost_by_category(category)
```

---

### 2. ⚠️ `script_split.run_script_split()` Zero Credits
**File:** `app/scene_engine/scenes/script_split.py:67`

**Issue:** Explicitly bypasses charging:
```python
credits_cost=0,
```

**Impact:**
- Script splitting consumes AI resources but is free
- Users can split scripts repeatedly without cost

**Recommendation:** Decide if this should charge credits. If so, set to dynamic pricing:
```python
credits_cost=1,  # or dynamic via credit_price_service
```

---

### 3. ⚠️ PydanticAI Services Not Charging Credits
**Files:**
- `app/scene_engine/scenes/chat.py`
- `app/scene_engine/scenes/episode_characters.py`
- `app/ai_scene_test/runner.py`

**Issue:** These services use `resolve_text_model_for_pydantic_ai()` which resolves the model config but does NOT charge credits.

**Impact:**
- Scene chat (with pydantic-ai tools) is free
- Episode character extraction via pydantic-ai is free
- Scene test chat via pydantic-ai is free

**Recommendation:** If these should charge, wrap them with credit charging logic or route through `ai_gateway_service.chat_text_stream()`.

---

### 4. ⚠️ `ai_storyboard_service._chat_completions()` Hardcoded Credits
**File:** `app/services/ai_storyboard_service.py:235-243`

**Issue:** Uses hardcoded `credits_cost=1`:
```python
raw = await ai_gateway_service.chat_text(
    ...
    credits_cost=1,
)
```

**Impact:**
- Storyboard generation always costs 1 credit regardless of model pricing

**Recommendation:** Use dynamic pricing:
```python
credits_cost = credit_price_service.get_model_cost(model_config)
```

---

### 5. ⚠️ `ai_asset_extraction_service._chat_completions()` Hardcoded Credits
**File:** `app/services/ai_asset_extraction_service.py:334-343`

**Issue:** Uses hardcoded `credits_cost=1`:
```python
raw = await ai_gateway_service.chat_text(
    ...
    credits_cost=1,
)
```

**Impact:**
- Asset extraction always costs 1 credit regardless of model pricing

**Recommendation:** Use dynamic pricing.

---

### 6. ⚠️ Agent Executions Don't Create AIUsageEvent
**File:** `app/services/agent_service.py`

**Issue:** Agent executions use `reason="agent.consume"` but do NOT create `AIUsageEvent` records.

**Impact:**
- Agent executions won't appear in the `ai_usage_events` table
- No usage analytics for agent calls
- Harder to track agent usage patterns

**Recommendation:** Add `AIUsageEvent` creation in `agent_service.run_text_agent()` similar to `ai_gateway_service`.

---

### 7. ⚠️ Scene Engine Services Without Frontend Routes
**Files:**
- `app/services/ai_storyboard_service.py`
- `app/services/ai_asset_extraction_service.py`
- `app/scene_engine/scenes/script_split.py`

**Issue:** These services have no direct API routes; they're called internally.

**Impact:**
- No direct user-facing API for storyboard generation
- No direct user-facing API for asset extraction
- May be triggered via batch/extraction workflows

**Recommendation:** Document which frontend workflows trigger these services.

---

## Backend-Only Charging Paths

These paths charge credits but have no direct frontend entry:

| Path | Backend File | Charges | Notes |
|------|--------------|---------|-------|
| Storyboard service chat | `ai_storyboard_service.py` | ✅ YES | Used by storyboard generation tasks |
| Asset extraction chat | `ai_asset_extraction_service.py` | ✅ YES | Used by asset extraction tasks |
| Episode agent handlers (6) | `episode_*_agent_apply.py` | ✅ YES | Used by episode processing tasks |
| Asset image task | `asset_image_generate.py` | ✅ YES | Used by asset generation tasks |
| Model test image task | `model_test_image_generate.py` | ✅ YES | Used by model test sessions |
| Shot video task | `shot_video_generate.py` | ✅ YES | Used by shot video generation |

---

## Paths Without Charging

These paths exist but do NOT charge credits:

| Path | File | Reason |
|------|------|--------|
| `script_split.run_script_split()` | `script_split.py` | Explicitly `credits_cost=0` |
| `run_chat()` (pydantic-ai) | `chat.py` | Uses pydantic-ai directly |
| `run_episode_characters()` (pydantic-ai) | `episode_characters.py` | Uses pydantic-ai directly |
| `run_scene_test_chat()` (pydantic-ai) | `runner.py` | Uses pydantic-ai directly |
| Batch video AI Polish | `batch-video/page.tsx` | Text editing only, no AI |

---

## Summary of Gaps

| Gap | Severity | Impact |
|-----|----------|--------|
| `submit_media_async()` hardcoded pricing | HIGH | Revenue mismatch for video models |
| PydanticAI services not charging | MEDIUM | Free AI usage via scene chat/tools |
| Hardcoded `credits_cost=1` in services | MEDIUM | Pricing doesn't match actual model cost |
| Agent executions no AIUsageEvent | LOW | Missing analytics data |
| Script split free usage | LOW | Potential abuse |

---

## Verification Commands

To verify these paths:

```bash
# Check submit_media_async hardcoded pricing
grep -n "credits_cost = 10" fastapi_backend/app/ai_gateway/service.py

# Check script_split zero credits
grep -n "credits_cost=0" fastapi_backend/app/scene_engine/scenes/script_split.py

# Check ai_storyboard_service hardcoded credits
grep -n "credits_cost=1" fastapi_backend/app/services/ai_storyboard_service.py

# Check ai_asset_extraction_service hardcoded credits
grep -n "credits_cost=1" fastapi_backend/app/services/ai_asset_extraction_service.py

# Check pydantic-ai model factory (no charging)
grep -n "credit_service" fastapi_backend/app/ai_runtime/pydanticai_model_factory.py

# Verify AIUsageEvent NOT in agent_service
grep -n "AIUsageEvent" fastapi_backend/app/services/agent_service.py
```

---

**End of missing path check**
