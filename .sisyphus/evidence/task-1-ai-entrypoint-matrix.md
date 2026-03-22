# Task 1: AI Entry Point Coverage Matrix

**Audit Date**: 2026-03-22
**Auditor**: Sisyphus-Junior
**Repo**: F:\animate-serial\apps\anyreason

## Purpose

This file is the definitive coverage matrix of every resource-consuming AI entry point in the repository, mapping each frontend trigger to its specific backend charging path. Downstream Tasks 11-14 depend on this matrix.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Frontend entry point exists and is mapped |
| ⚠️ | Ambiguous — unclear if credits are charged, or multiple paths |
| 🔴 | Backend-only path with no user-facing frontend entry (still charges credits) |
| ❌ | Path exists but does NOT charge credits |

---

## PART A: Frontend Entry Points → Backend Charge Paths

### A1. Text / Chat Operations

| # | Frontend Entry | File | Route Called | Backend Charge Method | Category | Estimated Cost Source | Cost Preview? |
|---|---------------|------|-------------|---------------------|----------|---------------------|--------------|
| 1 | Chat page (scene streaming) | `nextjs-frontend/app/(aistudio)/chat/page.tsx` → `handleSend()` | `POST /api/ai/scenes/{scene_code}/chat/stream` | `ai_gateway_service.chat_text_stream()` | text | `credits_cost` param (default 1, dynamic via `credit_price_service`) | **No** — no `CreditCostPreview` in UI |
| 2 | AI Scenes runner page | `nextjs-frontend/app/(aistudio)/ai/page.tsx` → `run()` | `POST /api/ai/scenes/{scene_code}/chat/stream` | `ai_gateway_service.chat_text_stream()` | text | Same as above | **No** |
| 3 | Model Test page — Text tab | `nextjs-frontend/app/(aistudio)/ai/model-test/page.tsx` → `TextPanel.handleSend()` | `POST /api/ai/admin/model-configs/{id}/test-chat/stream` | `ai_gateway_service.chat_text_stream()` | text | Same as above | **No** |
| 4 | Scripts AI Assistant pane | `nextjs-frontend/components/scripts/ScriptAIAssistantPane.tsx` | `POST /api/ai/scenes/{scene_code}/chat/stream` | `ai_gateway_service.chat_text_stream()` | text | Same as above | **No** |
| 5 | Scripts AI Assistant (chatbox) | `nextjs-frontend/components/scripts/ScriptAIAssistantChatboxPane.tsx` | `POST /api/ai/scenes/{scene_code}/chat/stream` | `ai_gateway_service.chat_text_stream()` | text | Same as above | **No** |
| 6 | Scripts AI Assistant (session) | `nextjs-frontend/components/scripts/ScriptAIAssistantSessionPane.tsx` | `POST /api/ai/scenes/{scene_code}/chat/stream` | `ai_gateway_service.chat_text_stream()` | text | Same as above | **No** |

> **Key**: All scene-chat entries route to `POST /api/ai/scenes/{scene_code}/chat/stream` → `ai_scene_runner.py:ai_scene_chat_stream()` → `ai_gateway_service.chat_text_stream()`. The scene runner does NOT charge credits directly — it passes through `chat_text_stream()` which does.

**Classification**: All 6 entries → `text` / streaming chat

---

### A2. Image Generation Operations

| # | Frontend Entry | File | Route Called | Backend Charge Method | Category | Estimated Cost Source | Cost Preview? |
|---|---------------|------|-------------|---------------------|----------|---------------------|--------------|
| 7 | Image generation page | `nextjs-frontend/app/(aistudio)/ai/image/page.tsx` → `handleGenerate()` | `POST /api/v1/media/generate` (via `generateMedia()`) | `ai_gateway_service.generate_media()` | image | `credit_price_service.get_model_cost()` or `get_cost_by_category("image")` | **Post-hoc only** — displays `result.cost` in result area |
| 8 | Model Test page — Image tab | `nextjs-frontend/app/(aistudio)/ai/model-test/page.tsx` → `ImagePanel.handleGenerate()` | `POST /api/v1/media/generate` (via `generateMedia()`) | `ai_gateway_service.generate_media()` | image | Same as above | **Post-hoc only** — displays `res.cost` in result Badge |
| 9 | Canvas ImageGridEditor modal | `nextjs-frontend/components/canvas/nodes/ImageGridEditorModal.tsx` | `POST /api/v1/media/generate` or task-based via `asset_image_generate` | `ai_gateway_service.generate_media()` (via task handler) | image | Same as above | **Unknown** — component not fully inspected |

> **Key**: `nextjs-frontend/components/actions/ai-media-actions.ts:generateMedia()` calls `POST /api/v1/media/generate` → `ai_media.py:ai_generate_media()` → `ai_gateway_service.generate_media()`.

**Classification**: All image entries → `image`

---

### A3. Video / Async Media Operations

| # | Frontend Entry | File | Route Called | Backend Charge Method | Category | Estimated Cost Source | Cost Preview? |
|---|---------------|------|-------------|---------------------|----------|---------------------|--------------|
| 10 | Video generation page | `nextjs-frontend/app/(aistudio)/ai/video/page.tsx` → `handleGenerate()` | `POST /api/v1/media/generate` (via `generateMedia()`) | `ai_gateway_service.generate_media()` | video | `credit_price_service.get_model_cost()` or `get_cost_by_category("video")` | **Post-hoc only** — displays `result.cost` in result area |
| 11 | Model Test page — Video tab | `nextjs-frontend/app/(aistudio)/ai/model-test/page.tsx` → `VideoPanel.handleGenerate()` | `POST /api/v1/media/generate` (via `generateMedia()`) | `ai_gateway_service.generate_media()` | video | Same as above | **Post-hoc only** — displays `res.cost` in result Badge |
| 12 | Batch Video — video-gen tab | `nextjs-frontend/app/(aistudio)/batch-video/page.tsx` → `handleGenerate()` | `POST /api/batch-video/assets/generate` | Task `batch_video_asset_generate` → `submit_media_async()` OR `generate_media()` | video | Hardcoded: `10 credits` in `submit_media_async()` for video | **No** — no cost shown before submit |
| 13 | Batch Video — retry task | Same file → `POST /api/batch-video/tasks/{id}/retry` | Same as #12 | Same as #12 | video | Same as #12 | **No** |
| 14 | Batch Video — AI Polish Wizard | Same file → `POST /api/batch-video/cards/batch-update-prompts` | `batch_update_asset_prompts` → local edit only | **❌ No charge** (text editing, no AI call) | N/A | N/A | N/A |

> **Key for #12/#13**: Batch video routes through task queue → `batch_video_asset_generate.py` handler. The handler calls `submit_media_async()` which charges **10 credits** for video (hardcoded, `category == "video"`). For fallback blocking path, it calls `generate_media()`.

**Classification**: Entries 10-13 → `video`. Entry 14 → not charged.

---

### A4. Agent Execution Operations

| # | Frontend Entry | File | Route Called | Backend Charge Method | Category | Estimated Cost Source | Cost Preview? |
|---|---------------|------|-------------|---------------------|----------|---------------------|--------------|
| 15 | Agent execution (admin use) | `nextjs-frontend/components/agents/AgentPickerDialog.tsx` — calls agent run | `POST /api/v1/agents/{id}/run` | `agent_service.run_text_agent()` → deducts `agent.credits_per_call` | agent (text) | `agent.credits_per_call` (static, per-agent DB field) | **Shows `credits_per_call` in picker** but not before invoke |
| 16 | My Agents page | `nextjs-frontend/app/(aistudio)/my-agents/page.tsx` | **No AI invocation** — only CRUD | N/A | N/A | N/A | N/A |
| 17 | Canvas TextGenNode | `nextjs-frontend/components/canvas/nodes/TextGenNode.tsx` | Likely scene chat stream (`POST /api/ai/scenes/.../chat/stream`) | `ai_gateway_service.chat_text_stream()` | text | Dynamic | **No** |

> **Key for #15**: `AgentPickerDialog.tsx` (referenced in plan) shows `credits_per_call` metadata in the picker. The actual invocation is `POST /api/v1/agents/{agent_id}/run` → `agents.py:run_agent()` → `agent_service.run_text_agent()`. Charge is `agent.credits_per_call` (ref: `agent_service.py` lines 188-199).

**Classification**: #15 → `agent`. #17 → `text`.

---

### A5. Batch Derivative / Asset Extraction Operations

| # | Frontend Entry | File | Route Called | Backend Charge Method | Category | Estimated Cost Source | Cost Preview? |
|---|---------------|------|-------------|---------------------|----------|---------------------|--------------|
| 18 | Asset extraction lab | `nextjs-frontend/app/(aistudio)/extraction/page.tsx` → `runExtraction()` | `POST /api/tasks` with type `freeformAssetExtractionComparePreview` | ⚠️ **Ambiguous** — creates `freeformAssetExtractionComparePreview` task. Task handlers not inspected for credit charging. | text (indirect) | Unknown | **No** |
| 19 | Canvas nodes (AssetNode, PromptNode, etc.) | `nextjs-frontend/components/canvas/nodes/*.tsx` | Various — may invoke scene chat or media generation | Ambiguous per node type | various | Ambiguous | **Unknown** |

> **⚠️ Gap**: Extraction task handler (`freeformAssetExtractionComparePreview`) was NOT fully inspected. This is a potential missing path — needs verification.

**Classification**: #18 → `text` (indirect). #19 → Ambiguous.

---

## PART B: Backend Charge Path Inventory

### B1. Canonical Charge Methods

All credit charging routes through these 4 methods in `fastapi_backend/app/ai_gateway/service.py`:

| Method | reason | Category | Cost Source | Routes |
|--------|--------|----------|------------|--------|
| `chat_text()` | `ai.consume` | text | `credit_price_service.get_model_cost()` (dynamic) | `ai_text.py:ai_text_chat()` |
| `chat_text_stream()` | `ai.consume` | text | `credits_cost` param (default 1) | `ai_text.py:ai_text_chat_stream()` |
| `generate_media()` | `ai.consume` | image/video | `credit_price_service.get_model_cost()` or `get_cost_by_category()` | `ai_image.py`, `ai_video.py`, `ai_media.py`, task handlers |
| `submit_media_async()` | `ai.consume` | video/other | **Hardcoded**: `10` for video, `5` for other | Task handlers (batch video, asset video, shot video) |

### B1.5 Backend-Only Internal Service Paths

These services are called internally by tasks/other services and charge credits:

| Service | File | Calls | Charges | Cost Source |
|---------|------|-------|---------|-------------|
| `ai_storyboard_service._chat_completions()` | `app/services/ai_storyboard_service.py:214-244` | `ai_gateway_service.chat_text()` | ✅ YES | `credit_price_service.get_model_cost()` (hardcoded 1 in call) |
| `ai_asset_extraction_service._chat_completions()` | `app/services/ai_asset_extraction_service.py:313-343` | `ai_gateway_service.chat_text()` | ✅ YES | `credit_price_service.get_model_cost()` (hardcoded 1 in call) |
| `script_split.run_script_split()` | `app/scene_engine/scenes/script_split.py:34-72` | `ai_gateway_service.chat_text()` | ❌ NO | `credits_cost=0` explicitly bypasses charging |
| Episode Agent Handlers | `app/tasks/handlers/episode_*_agent_apply.py` (6 files) | `agent_service.run_dialogue_agent()` | ✅ YES | `Agent.credits_per_call` |
| Asset Image Handler | `app/tasks/handlers/asset_image_generate.py:179` | `ai_gateway_service.generate_media()` | ✅ YES | `credit_price_service.get_model_cost()` |
| Model Test Image Handler | `app/tasks/handlers/model_test_image_generate.py` | `ai_gateway_service.generate_media()` | ✅ YES | `credit_price_service.get_model_cost()` |
| Shot Video Handler (sync) | `app/tasks/handlers/shot_video_generate.py` | `ai_gateway_service.generate_media()` | ✅ YES | `credit_price_service.get_model_cost()` |
| Shot Video Handler (async) | `app/tasks/handlers/shot_video_generate.py` | `ai_gateway_service.submit_media_async()` | ✅ YES | Hardcoded 10 for video |

### B1.6 PydanticAI-Based Services (NO CREDITS)

These services use pydantic-ai directly without going through ai_gateway_service:

| Service | File | Charges | Notes |
|---------|------|---------|-------|
| `run_chat()` | `app/scene_engine/scenes/chat.py` | ❌ NO | Uses `resolve_text_model_for_pydantic_ai()` |
| `run_episode_characters()` | `app/scene_engine/scenes/episode_characters.py` | ❌ NO | Uses `resolve_text_model_for_pydantic_ai()` |
| `run_scene_test_chat()` | `app/ai_scene_test/runner.py` | ❌ NO | Uses `resolve_text_model_for_pydantic_ai()` |

### B2. Agent Charge Methods

In `fastapi_backend/app/services/agent_service.py`:

| Method | reason | Cost Source |
|--------|--------|------------|
| `run_text_agent()` | `agent.consume` / `agent.refund` | `agent.credits_per_call` (static DB field per agent) |
| `run_dialogue_agent()` | Same as above | Delegates to `run_text_agent()` |

### B3. AIUsageEvent Recording

Every charge path records an `AIUsageEvent` in the `finally:` block:
- `ai_gateway_service`: category, binding_key, ai_model_config_id, cost_credits, latency_ms, error_code, raw_payload
- `agent_service`: **Only records in transaction meta**, does NOT create `AIUsageEvent` (confirmed by grep — `AIUsageEvent` not used in `agent_service.py`)
  - This means agent executions won't appear in the `ai_usage_events` table for analytics

### B4. Backend-Only Paths (no direct frontend trigger)

| Path | Description | Charges Credits? |
|------|-------------|-------------------|
| `ai_storyboard_service` | Storyboard generation service | ✅ YES — via `chat_text()` with hardcoded credits_cost=1 |
| `ai_asset_extraction_service` | Asset extraction service | ✅ YES — via `chat_text()` with hardcoded credits_cost=1 |
| `script_split.run_script_split()` | Script splitting service | ❌ NO — `credits_cost=0` explicitly bypasses |
| Episode agent handlers | 6 task handlers for character/scene/prop/vfx/storyboard/asset extraction | ✅ YES — via `agent_service.run_dialogue_agent()` |
| `asset_image_generate` task | Asset image generation task | ✅ YES — via `generate_media()` |
| `model_test_image_generate` task | Model test image generation | ✅ YES — via `generate_media()` |
| `shot_video_generate` task | Shot video generation (sync/async) | ✅ YES — via `generate_media()` or `submit_media_async()` |
| `ai_scene_test` → async task flow | `POST /api/ai/scenes/{scene_code}/chat` creates async task | ❌ **No direct charge** — routes to `chat_text_stream()` via task processing |
| PydanticAI services | `run_chat()`, `run_episode_characters()`, `run_scene_test_chat()` | ❌ NO — direct pydantic-ai usage, no ai_gateway_service |

---

## PART C: Summary Mapping Table

| ID | Operation Type | Frontend Entry File | Backend Route | Charge Method | Cost Source | Pre-submit Preview? |
|----|---------------|-------------------|-------------|---------------|-------------|---------------------|
| 1 | text/chat (stream) | `chat/page.tsx` | `/api/ai/scenes/{code}/chat/stream` | `chat_text_stream()` | dynamic/price_service | **No** |
| 2 | text/chat (stream) | `ai/page.tsx` | `/api/ai/scenes/{code}/chat/stream` | `chat_text_stream()` | dynamic/price_service | **No** |
| 3 | text/chat (stream) | `ai/model-test/page.tsx` (text tab) | `/api/ai/admin/model-configs/{id}/test-chat/stream` | `chat_text_stream()` | dynamic/price_service | **No** |
| 4 | text/chat (stream) | `scripts/ScriptAIAssistantPane.tsx` | `/api/ai/scenes/{code}/chat/stream` | `chat_text_stream()` | dynamic/price_service | **No** |
| 5 | text/chat (stream) | `scripts/ScriptAIAssistantChatboxPane.tsx` | `/api/ai/scenes/{code}/chat/stream` | `chat_text_stream()` | dynamic/price_service | **No** |
| 6 | text/chat (stream) | `scripts/ScriptAIAssistantSessionPane.tsx` | `/api/ai/scenes/{code}/chat/stream` | `chat_text_stream()` | dynamic/price_service | **No** |
| 7 | image | `ai/image/page.tsx` | `/api/v1/media/generate` | `generate_media()` | dynamic/price_service | **Post-hoc only** |
| 8 | image | `ai/model-test/page.tsx` (image tab) | `/api/v1/media/generate` | `generate_media()` | dynamic/price_service | **Post-hoc only** |
| 9 | image | `canvas/nodes/ImageGridEditorModal.tsx` | `/api/v1/media/generate` or task | `generate_media()` | dynamic/price_service | **Unknown** |
| 10 | video | `ai/video/page.tsx` | `/api/v1/media/generate` | `generate_media()` | dynamic/price_service | **Post-hoc only** |
| 11 | video | `ai/model-test/page.tsx` (video tab) | `/api/v1/media/generate` | `generate_media()` | dynamic/price_service | **Post-hoc only** |
| 12 | video/batch | `batch-video/page.tsx` (video-gen) | `/api/batch-video/assets/generate` → task | `submit_media_async()` | **hardcoded 10** for video | **No** |
| 13 | video/batch | `batch-video/page.tsx` (retry) | `/api/batch-video/tasks/{id}/retry` → task | `submit_media_async()` | **hardcoded 10** for video | **No** |
| 14 | batch/text-edit | `batch-video/page.tsx` (AI Polish) | `/api/batch-video/cards/batch-update-prompts` | **❌ No charge** | N/A | N/A |
| 15 | agent | `agents/AgentPickerDialog.tsx` | `/api/v1/agents/{id}/run` | `run_text_agent()` | `agent.credits_per_call` | **Shows in picker only** |
| 16 | agent CRUD | `my-agents/page.tsx` | CRUD only — no invocation | N/A | N/A | N/A |
| 17 | text/chat | `canvas/nodes/TextGenNode.tsx` | Likely scene chat stream | `chat_text_stream()` | dynamic/price_service | **Unknown** |
| 18 | text/compare | `extraction/page.tsx` | `/api/tasks` (freeformAssetExtractionComparePreview) | ⚠️ **Ambiguous** | ⚠️ Unknown | **No** |
| 19 | various | `canvas/nodes/*.tsx` (other) | Various | ⚠️ **Ambiguous per node** | Ambiguous | **Unknown** |

---

## PART D: Cost Estimate Infrastructure

### Existing Components

- **API**: `POST /api/v1/ai/cost-estimate` (`ai_cost_estimate.py`)
  - Input: `{ category, model_config_id }`
  - Output: `{ estimated_cost, user_balance, sufficient }`
  - Uses: `credit_price_service.get_cost_by_model_config_id()` or `get_cost_by_category()`

- **Component**: `CreditCostPreview.tsx` (`nextjs-frontend/components/credits/CreditCostPreview.tsx`)
  - Props: `category`, `modelConfigId`, `estimatedCost`, `userBalance`
  - Calls `POST /api/ai/cost-estimate` internally if `estimatedCost` not provided
  - Shows: cost label, balance, warning state
  - **Currently NOT integrated** into any AI entry page

- **Response cost**: `MediaGenerationResponse.cost` returned by `ai_gateway_service.generate_media()` — appears in result display only

### Agent Cost Metadata

- `Agent.credits_per_call` (DB field, `fastapi_backend/app/models.py`)
- Exposed via `AgentRead` schema (`schemas_agents.py`)
- Shown in `AgentPickerDialog.tsx` picker UI
- **Not passed to cost estimate API** — agents use static per-call price

---

## Files Verified for This Audit

### Backend (charges)
- `fastapi_backend/app/ai_gateway/service.py` — full read (lines 1-856)
- `fastapi_backend/app/services/agent_service.py` — full read (lines 1-256)
- `fastapi_backend/app/api/v1/ai_text.py` — full read
- `fastapi_backend/app/api/v1/ai_image.py` — full read
- `fastapi_backend/app/api/v1/ai_video.py` — full read
- `fastapi_backend/app/api/v1/ai_media.py` — full read
- `fastapi_backend/app/api/v1/agents.py` — full read
- `fastapi_backend/app/api/v1/ai_cost_estimate.py` — full read
- `fastapi_backend/app/api/v1/batch_video.py` — full read
- `fastapi_backend/app/api/v1/ai_scene_runner.py` — full read
- `fastapi_backend/app/tasks/handlers/batch_video_asset_generate.py` — full read
- `fastapi_backend/app/tasks/handlers/asset_image_generate.py` — full read
- `fastapi_backend/app/tasks/handlers/asset_video_generate.py` — full read
- `fastapi_backend/app/tasks/handlers/shot_video_generate.py` — full read

### Backend (no charges found)
- `fastapi_backend/app/ai_scene_test/runner.py` — grep for credit_service, no matches
- `fastapi_backend/app/tasks/handlers/` — grep for credit_service, no matches in any handler

### Frontend
- `nextjs-frontend/app/(aistudio)/chat/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/ai/image/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/ai/video/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/batch-video/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/extraction/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/my-agents/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/ai/page.tsx` — full read
- `nextjs-frontend/app/(aistudio)/ai/model-test/page.tsx` — full read
- `nextjs-frontend/components/credits/CreditCostPreview.tsx` — full read
- `nextjs-frontend/components/actions/ai-media-actions.ts` — full read
- `nextjs-frontend/components/actions/agent-actions.ts` — full read
- `nextjs-frontend/components/scripts/ScriptAIAssistantPane.tsx` — partial read (grep)
- `nextjs-frontend/components/scripts/ScriptAIAssistantChatboxPane.tsx` — grep confirmed
- `nextjs-frontend/components/scripts/ScriptAIAssistantSessionPane.tsx` — grep confirmed

---

## Downstream Task Impact

| Task | Relies On | Required Coverage |
|------|-----------|-------------------|
| Task 11 (text/chat cost labeling) | IDs 1-6, 17 | Requires pre-submit `CreditCostPreview` integration |
| Task 12 (image cost labeling) | IDs 7-9 | Requires pre-submit `CreditCostPreview` integration |
| Task 13 (video/async cost labeling) | IDs 10-13 | Requires pre-submit `CreditCostPreview` integration; #12/#13 need special handling (hardcoded 10 credits) |
| Task 14 (agent cost labeling) | ID 15 | Requires `credits_per_call` display before invoke in picker/dialog |

---

*End of matrix. For unmapped/ambiguous paths, see `task-1-missing-path-check.md`.*
