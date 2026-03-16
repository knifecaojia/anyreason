# batch_video_asset_generate meta 丢失 bug 修复计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 batch_video_asset_generate.submit() 中 ExternalSubmitResult.meta 覆盖 provider ref.meta 的 bug，导致 Vidu poller 缺少 api_key/base_url 任务卡在 waiting_external 10%。

**Architecture:** 问题在 batch_video_asset_generate.py:232-236，直接用 `{"job_id": job_id, "asset_id": asset_id}` 覆盖了 ref.meta（包含 api_key/base_url）。正确做法是合并 meta，参考 shot_video_generate.py:141-145 的写法。

**Tech Stack:** FastAPI + SQLAlchemy + async task system

---

## 问题根因

```python
# batch_video_asset_generate.py:232-236 (BUG)
return ExternalSubmitResult(
    external_task_id=ref.external_task_id,
    provider=ref.provider,
    meta={"job_id": job_id, "asset_id": asset_id},  # 覆盖了 ref.meta!
)

# shot_video_generate.py:141-145 (正确做法)
return ExternalSubmitResult(
    external_task_id=ref.external_task_id,
    provider=ref.provider,
    meta=ref.meta,  # 直接透传
)
```

`ref.meta` 包含:
- `api_key` - provider API 密钥
- `base_url` - provider 端点
- `concurrency_config_id`
- `concurrency_api_key`

当 meta 被覆盖后，`query_media_status` (service.py:552-553) 无法获取 api_key/base_url，导致轮询失败。

---

## Task 1: 修复 submit() 回归测试

**Files:**
- Test: `fastapi_backend/tests/tasks/test_batch_video_asset_generate.py` (新建)

**Step 1: 创建测试文件**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from app.tasks.handlers.batch_video_asset_generate import BatchVideoAssetGenerateHandler

class TestBatchVideoAssetGenerateMeta:
    @pytest.fixture
    def handler(self):
        return BatchVideoAssetGenerateHandler()

    @pytest.mark.asyncio
    async def test_submit_preserves_ref_meta(self, handler, db_session, mock_reporter):
        """Regression test: submit() must preserve ref.meta (api_key, base_url)"""
        task = MagicMock()
        task.id = uuid4()
        task.user_id = uuid4()
        task.input_json = {
            "job_id": str(uuid4()),
            "asset_id": str(uuid4()),
            "source_url": "https://example.com/image.jpg",
            "prompt": "test prompt",
            "config": {"duration": 5, "model_config_id": str(uuid4())}
        }
        
        # Mock ai_gateway_service.submit_media_async to return ref with meta
        mock_ref = MagicMock()
        mock_ref.external_task_id = "vidu-12345"
        mock_ref.provider = "vidu"
        mock_ref.meta = {
            "api_key": "secret-key-123",
            "base_url": "https://api.vidu.com",
            "concurrency_config_id": "config-123",
            "concurrency_api_key": "key-123"
        }
        
        with patch("app.tasks.handlers.batch_video_asset_generate.ai_gateway_service") as mock_gateway:
            mock_gateway.submit_media_async = AsyncMock(return_value=mock_ref)
            
            result = await handler.submit(db=db_session, task=task, reporter=mock_reporter)
        
        # Critical assertion: meta must contain provider credentials
        assert "api_key" in result.meta, "api_key missing from meta"
        assert "base_url" in result.meta, "base_url missing from meta"
        assert result.meta["api_key"] == "secret-key-123"
        assert result.meta["base_url"] == "https://api.vidu.com"
        # job_id/asset_id should also be preserved
        assert "job_id" in result.meta
        assert "asset_id" in result.meta
```

**Step 2: 运行测试验证失败**

```bash
cd fastapi_backend
uv run pytest tests/tasks/test_batch_video_asset_generate.py::TestBatchVideoAssetGenerateMeta::test_submit_preserves_ref_meta -v
```

Expected: FAIL - "api_key missing from meta"

**Step 3: Commit**

```bash
git add fastapi_backend/tests/tasks/test_batch_video_asset_generate.py
git commit -m "test: add regression test for meta preservation"
```

---

## Task 2: 修复 submit() 实现

**Files:**
- Modify: `fastapi_backend/app/tasks/handlers/batch_video_asset_generate.py:232-236`

**Step 1: 修改 submit() 方法**

```python
# 原代码 (line 232-236):
return ExternalSubmitResult(
    external_task_id=ref.external_task_id,
    provider=ref.provider,
    meta={"job_id": job_id, "asset_id": asset_id},
)

# 修改为:
return ExternalSubmitResult(
    external_task_id=ref.external_task_id,
    provider=ref.provider,
    meta={**ref.meta, "job_id": job_id, "asset_id": asset_id},
)
```

**Step 2: 运行测试验证通过**

```bash
cd fastapi_backend
uv run pytest tests/tasks/test_batch_video_asset_generate.py::TestBatchVideoAssetGenerateMeta::test_submit_preserves_ref_meta -v
```

Expected: PASS

**Step 3: Commit**

```bash
git add fastapi_backend/app/tasks/handlers/batch_video_asset_generate.py
git commit -m "fix: preserve ref.meta in batch_video_asset_generate.submit()"
```

---

## Task 3: 验证整体流程

**Step 1: 运行相关测试**

```bash
cd fastapi_backend
uv run pytest tests/tasks/ -v -k "batch_video" --tb=short
```

Expected: All pass

**Step 2: 检查 lsp_diagnostics**

确认无新增错误

**Step 3: Commit**

```bash
git commit -m "test: verify batch_video_asset_generate tests pass"
```

---

## Task 4: 恢复 stuck 的 waiting_external 任务

**Context:** 修复前提交的任务卡在 waiting_external 10%，因为 external_meta 缺少 api_key/base_url。

**Recovery Strategy:** 
1. 查询 external_meta 缺少 api_key 的 waiting_external 任务
2. 从 input_json.config.model_config_id 重新获取凭证
3. 更新 external_meta

**Files:**
- Modify: `fastapi_backend/app/tasks/recovery.py` (新建)

**Step 1: 创建恢复脚本**

```python
"""Recovery script for batch_video_asset_generate tasks stuck with missing meta."""
import asyncio
from uuid import UUID
from sqlalchemy import select, and_

from app.database import async_session_maker
from app.models import Task


async def recover_stuck_tasks():
    """Find and recover tasks where external_meta is missing api_key/base_url."""
    async with async_session_maker() as db:
        # Find stuck tasks: waiting_external, batch_video type, missing api_key
        result = await db.execute(
            select(Task).where(
                and_(
                    Task.type == "batch_video_asset_generate",
                    Task.status == "waiting_external",
                )
            )
        )
        tasks = result.scalars().all()
        
        recovered = []
        for task in tasks:
            meta = task.external_meta or {}
            if "api_key" not in meta or "base_url" not in meta:
                # Need to recover from model_config_id
                input_json = task.input_json or {}
                config = input_json.get("config", {})
                model_config_id = config.get("model_config_id")
                
                if not model_config_id:
                    print(f"Task {task.id}: no model_config_id, cannot recover")
                    continue
                
                # Query model config to get api_key/base_url
                # (Implementation depends on your model config storage)
                # For now, log the task for manual recovery
                print(f"Task {task.id}: needs recovery, model_config_id={model_config_id}")
                recovered.append(task.id)
        
        print(f"Found {len(recovered)} tasks needing recovery")
        return recovered


if __name__ == "__main__":
    asyncio.run(recover_stuck_tasks())
```

**Step 2: 实际执行恢复 (推荐先 dry-run)**

根据实际情况编写完整的恢复逻辑，从 AIModelConfig 表查询 api_key/base_url，然后 UPDATE Task.external_meta。

---

## 验证清单

- [ ] 回归测试通过
- [ ] submit() 修复后测试通过
- [ ] LSP diagnostics 干净
- [ ] 恢复脚本生成/执行
