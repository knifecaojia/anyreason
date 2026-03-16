# 任务依赖系统方案详解

## 问题场景

当前系统的问题：Task 之间完全独立，无法表达依赖关系。

```
场景1: 视频生成流水线
  Task A: 生成角色图片 (5分钟)
  Task B: 生成场景图片 (3分钟) 
  Task C: 基于A和B生成视频 (需要等A和B都完成)
  
  现状：必须手动按顺序提交，或者外部协调
  目标：自动等待依赖完成后执行

场景2: 分镜批量处理
  Task 1-10: 生成分镜图片 (可并行)
  Task 11: 汇总所有分镜生成PDF (必须等1-10完成)
  
  现状：前端用 batch-queue.ts 的拓扑排序，后端无感知
  目标：后端原生支持 DAG 执行
```

## 核心设计

### 1. 数据模型扩展

```python
# models.py - Task 表添加依赖字段
class Task(Base):
    # ... 现有字段 ...
    
    # 依赖管理
    depends_on = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # 存储: ["task-uuid-1", "task-uuid-2"]
    
    # 反向追踪 (可选，用于取消时级联)
    blocking = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # 存储依赖本任务的其他任务ID
    
    # 执行状态
    pending_deps_count = Column(Integer, nullable=False, server_default=text("0"))
    # 剩余未完成的依赖数
```

### 2. 状态流转图

```
                    ┌─────────────────────────────────────────┐
                    │            Task 生命周期                 │
                    └─────────────────────────────────────────┘
                    
    [创建 Task C 依赖 A,B]
            │
            ▼
    ┌───────────────┐
    │   pending     │  ← 等待依赖完成
    │  (依赖未满足)  │
    └───────┬───────┘
            │ depends_on=[A,B], pending_deps_count=2
            │
            │ 当 A 完成 → pending_deps_count=1
            │ 当 B 完成 → pending_deps_count=0
            ▼
    ┌───────────────┐     ┌─────────────┐
    │    queued     │────▶│   running   │
    │  (依赖已满足)  │     │   执行中     │
    └───────────────┘     └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌─────────┐  ┌─────────┐  ┌─────────┐
              │succeeded│  │ failed  │  │canceled │
              └─────────┘  └─────────┘  └─────────┘
                    │            │            │
                    └────────────┴────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ 触发被依赖任务的检查      │
                    │ (更新 pending_deps_count) │
                    └─────────────────────────┘
```

### 3. 关键流程改造

#### 3.1 创建带依赖的任务

```python
# task_service.py

async def create_task_with_deps(
    *,
    db: AsyncSession,
    task_type: str,
    input_json: dict,
    depends_on: list[UUID] | None = None,  # 新增参数
    user_id: UUID
) -> Task:
    """创建任务，支持指定依赖"""
    
    # 1. 验证所有依赖任务存在且属于同一用户
    if depends_on:
        dep_tasks = await db.execute(
            select(Task).where(Task.id.in_(depends_on), Task.user_id == user_id)
        )
        found_ids = {t.id for t in dep_tasks.scalars().all()}
        missing = set(depends_on) - found_ids
        if missing:
            raise ValueError(f"依赖任务不存在: {missing}")
    
    # 2. 创建任务
    task = Task(
        user_id=user_id,
        type=task_type,
        status="pending",  # 注意：不是 queued
        input_json=input_json,
        depends_on=[str(d) for d in (depends_on or [])],
        pending_deps_count=len(depends_on or []),
    )
    db.add(task)
    await db.flush()  # 获取 task.id
    
    # 3. 更新被依赖任务的 blocking 列表
    if depends_on:
        for dep_id in depends_on:
            await db.execute(
                update(Task)
                .where(Task.id == dep_id)
                .values(blocking=func.jsonb_build_array(task.id))
            )
    
    await db.commit()
    
    # 4. 如果没有依赖，立即入队
    if not depends_on:
        await enqueue_task(task_id=task.id)
    
    return task
```

#### 3.2 任务完成时的依赖检查

```python
# process_task.py - 任务完成时触发依赖检查

async def on_task_completed(task_id: UUID, status: str) -> None:
    """当任务完成/失败/取消时，检查并触发依赖它的任务"""
    
    async with async_session_maker() as db:
        # 1. 获取本任务阻塞了哪些任务
        task = await db.get(Task, task_id)
        if not task or not task.blocking:
            return
        
        for blocked_task_id in task.blocking:
            blocked_task = await db.get(Task, blocked_task_id)
            if not blocked_task:
                continue
            
            # 如果本任务失败，被阻塞任务也失败
            if status == "failed":
                await reporter.fail(
                    error=f"依赖任务 {task_id} 失败",
                    details={"failed_dependency": str(task_id)}
                )
                continue
            
            # 如果本任务取消，被阻塞任务也取消
            if status == "canceled":
                await reporter.cancel()
                continue
            
            # 减少待处理依赖计数
            blocked_task.pending_deps_count -= 1
            
            # 所有依赖都完成了，可以入队执行
            if blocked_task.pending_deps_count <= 0:
                blocked_task.status = "queued"
                blocked_task.pending_deps_count = 0
                await db.commit()
                await enqueue_task(task_id=blocked_task_id)
                logger.info(f"Task {blocked_task_id} 依赖已满足，开始执行")
            else:
                await db.commit()
```

#### 3.3 Worker 改造

```python
# worker.py - 支持并发和依赖检查

async def _worker_loop(worker_id: int) -> None:
    """单个 worker 的循环"""
    r = get_redis()
    
    while True:
        try:
            # 1. 先检查是否有依赖已满足但未入队的任务
            await check_pending_tasks()
            
            # 2. 阻塞等待新任务
            item = await r.brpop(settings.TASK_QUEUE_KEY, timeout=5)
            if not item:
                continue
            
            _queue, raw_id = item
            task_id = UUID(str(raw_id))
            
            # 3. 验证任务状态（可能被依赖检查提前改变了）
            async with async_session_maker() as db:
                task = await db.get(Task, task_id)
                if task.status != "queued":
                    logger.warning(f"Worker {worker_id}: Task {task_id} 状态为 {task.status}，跳过")
                    continue
            
            # 4. 处理任务
            await process_task(task_id=task_id)
            
            # 5. 任务完成后，检查依赖
            await on_task_completed(task_id, "succeeded")
            
        except Exception as e:
            logger.error(f"Worker {worker_id} 错误: {e}")
            await asyncio.sleep(1)


async def check_pending_tasks():
    """检查依赖已满足但仍为 pending 状态的任务"""
    # 每30秒执行一次，或作为独立定时任务
    async with async_session_maker() as db:
        pending_tasks = await db.execute(
            select(Task).where(
                Task.status == "pending",
                Task.pending_deps_count <= 0
            )
        )
        for task in pending_tasks.scalars():
            logger.info(f"发现就绪任务 {task.id}，重新入队")
            task.status = "queued"
            await enqueue_task(task_id=task.id)
        await db.commit()
```

### 4. DAG 执行优化

对于复杂依赖图，可以实现批量调度：

```python
# dag_scheduler.py

class DAGScheduler:
    """DAG 调度器：批量提交有依赖关系的任务"""
    
    async def submit_dag(self, dag: dict[str, TaskDef]) -> list[UUID]:
        """
        dag = {
            "task_a": {"type": "image_gen", "deps": []},
            "task_b": {"type": "image_gen", "deps": []},
            "task_c": {"type": "video_gen", "deps": ["task_a", "task_b"]},
        }
        返回创建的所有任务ID
        """
        # 1. 拓扑排序确定创建顺序
        sorted_tasks = self.topology_sort(dag)
        
        # 2. 按顺序创建，自动建立依赖关系
        task_ids = {}
        for task_name in sorted_tasks:
            task_def = dag[task_name]
            dep_ids = [task_ids[d] for d in task_def["deps"]]
            
            task = await self.create_task(
                type=task_def["type"],
                depends_on=dep_ids
            )
            task_ids[task_name] = task.id
        
        return list(task_ids.values())
```

### 5. API 接口改造

```typescript
// 前端类型定义
interface TaskCreateRequest {
  type: string;
  input_json: Record<string, unknown>;
  depends_on?: string[];  // 依赖的任务ID列表
  priority?: number;      // 优先级 (可选，配合方案C)
}

// 后端 Schema
class TaskCreateRequest(BaseModel):
    type: str
    input_json: dict
    depends_on: list[UUID] | None = None
    priority: int = 0
```

### 6. 前端集成示例

```typescript
// 批量创建有依赖的任务
async function createVideoPipeline() {
  // 1. 创建角色图 (无依赖)
  const charTask = await createTask({
    type: 'asset_image_generate',
    input_json: { prompt: 'character...' }
  });
  
  // 2. 创建场景图 (无依赖，可与角色图并行)
  const sceneTask = await createTask({
    type: 'asset_image_generate', 
    input_json: { prompt: 'scene...' }
  });
  
  // 3. 创建视频 (依赖前两个)
  const videoTask = await createTask({
    type: 'asset_video_generate',
    input_json: { 
      character_asset_id: charTask.id,
      scene_asset_id: sceneTask.id 
    },
    depends_on: [charTask.id, sceneTask.id]  // 关键！
  });
  
  // videoTask 会自动等待 charTask 和 sceneTask 完成
  return videoTask;
}
```

## 与其他方案的对比

| 场景 | 当前系统 | 多Worker (方案A) | 依赖系统 (方案B) |
|------|---------|-----------------|-----------------|
| 独立任务并行 | ❌ 单worker | ✅ N个并行 | ✅ N个并行 |
| Task A → Task B 顺序 | ❌ 需手动 | ❌ 需手动 | ✅ 自动等待 |
| Task A,B → Task C (多对一) | ❌ 不支持 | ❌ 不支持 | ✅ 等待全部完成 |
| DAG 批量提交 | ❌ 不支持 | ❌ 不支持 | ✅ 拓扑排序自动处理 |
| 取消级联 | ❌ 需手动 | ❌ 需手动 | ✅ 自动取消依赖任务 |

## 实施建议

**如果主要痛点是**：
- "视频生成必须等角色和场景图都准备好" → **方案B 优先级最高**
- "单纯想提升吞吐量" → 先做方案A（多Worker），再做方案B
- "紧急任务要插队" → 方案C（优先级队列）

**推荐组合**：方案A + 方案B
- 多Worker 提供并行能力
- 依赖系统 提供任务编排能力
