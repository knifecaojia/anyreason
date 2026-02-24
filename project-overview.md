# 项目概览：言之有理（AnyReason）

> 生成时间：2026-02-24
> 基于代码版本：v0.0.6（后端）/ v0.0.8（前端）

---

## 1. 项目定位

**言之有理（AnyReason）** 是一个面向漫剧创作企业的 **AI 协同生产平台**，覆盖"创意 → 剧本 → 资产 → 分镜 → 成片"的全流程。

核心目标：
- 提供可扩展的 AI 模型编排能力
- 资产管理与资产可视化
- 前后端分离、轻量化、RBAC 权限控制

---

## 2. 技术栈

### 后端（`fastapi_backend/`）
| 层次 | 技术 |
|------|------|
| 框架 | FastAPI 0.115 + Python 3.12 |
| ORM | SQLAlchemy（async）+ asyncpg |
| 鉴权 | fastapi-users（JWT Cookie） |
| 任务队列 | Redis（自研 brpop worker）+ 可选 Celery |
| AI 集成 | OpenAI SDK + pydantic-ai + Volcengine SDK |
| 对象存储 | MinIO（S3 兼容） |
| 数据库迁移 | Alembic |
| 日志 | Loguru |
| 限流 | SlowAPI |
| 测试 | pytest + pytest-asyncio |

### 前端（`nextjs-frontend/`）
| 层次 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 |
| UI 组件 | shadcn/ui + Radix UI + Tailwind CSS |
| 状态/表单 | react-hook-form + zod |
| API 客户端 | @hey-api/openapi-ts（自动生成 typed client） |
| 图表 | recharts |
| 流程图 | @xyflow/react（无限画布） |
| Markdown | react-markdown + remark-gfm |
| Toast | sonner |
| 测试 | Jest + Testing Library + Playwright |

### 基础设施（`docker/`）
| 服务 | 用途 |
|------|------|
| PostgreSQL 16 | 主数据库 |
| MinIO | 对象存储（剧本文件、资产图片） |
| Redis 7 | 任务队列 + 实时推送 |

---

## 3. 项目目录结构

```
/
├── fastapi_backend/          # Python 后端
│   ├── app/
│   │   ├── api/v1/           # REST API 路由（35+ 个路由文件）
│   │   ├── ai_gateway/       # AI 网关（文本/图像/视频统一调用）
│   │   ├── ai_runtime/       # pydantic-ai 运行时适配
│   │   ├── ai_scene_test/    # AI 场景测试框架
│   │   ├── ai_tools/         # AI 工具注册表
│   │   ├── core/             # 中间件、异常、初始化
│   │   ├── repositories/     # 数据访问层
│   │   ├── scene_engine/     # 场景引擎（chat/script_split/episode_characters）
│   │   ├── services/         # 业务逻辑层（25+ 个 service）
│   │   ├── storage/          # MinIO 客户端 + 缩略图
│   │   ├── tasks/            # 异步任务系统
│   │   │   └── handlers/     # 任务处理器（17 种任务类型）
│   │   ├── vfs_renderers/    # 虚拟文件系统渲染器
│   │   ├── models.py         # SQLAlchemy 数据模型
│   │   ├── schemas*.py       # Pydantic 请求/响应 Schema（按模块拆分）
│   │   └── main.py           # 应用入口
│   └── alembic_migrations/   # 数据库迁移文件
│
├── nextjs-frontend/          # Next.js 前端
│   ├── app/
│   │   ├── (aistudio)/       # 主应用路由组（需登录）
│   │   │   ├── dashboard/    # 工作台
│   │   │   ├── projects/     # 项目归档
│   │   │   ├── scripts/      # 剧本管理
│   │   │   ├── assets/       # 资产管理
│   │   │   ├── extraction/   # 资产提取
│   │   │   ├── storyboard/   # 分镜/故事板
│   │   │   ├── studio/       # 创作工坊（无限画布）
│   │   │   ├── ai-scenes/    # AI 场景测试
│   │   │   ├── chat/         # AI 助手对话
│   │   │   ├── tasks/        # 任务清单
│   │   │   ├── settings/     # 系统设置（模型/用户/角色/权限/审计）
│   │   │   └── my-agents/    # 我的 Agent
│   │   ├── api/              # Next.js API Routes（BFF 代理层）
│   │   ├── login/            # 登录页
│   │   ├── register/         # 注册页
│   │   └── openapi-client/   # 自动生成的 typed API 客户端
│   └── components/
│       ├── actions/          # Server Actions（登录/登出/AI/资产等）
│       ├── aistudio/         # 主布局、画布、项目卡片
│       ├── assets/           # 资产浏览器、面板、预览
│       ├── ai-chat/          # AI 对话气泡、会话列表
│       ├── scripts/          # 剧本 AI 助手面板
│       ├── storyboard/       # 故事板时间线
│       ├── tasks/            # 任务中心、进度监控
│       └── ui/               # 基础 UI 组件（shadcn）
│
└── docker/                   # Docker Compose 配置
```

---

## 4. 数据模型（核心实体）

### 4.1 用户与权限体系
```
User → WorkspaceMember → Workspace
User → Role（多对多，通过 RBAC）
User → UserCreditAccount（积分账户）
```

### 4.2 剧本与项目层级（Script-Centric）
```
Script（原始剧本文件，存 MinIO）
  └── Project（ID 与 Script 同构）
        └── Episode（集，含 script_full_text）
              └── Storyboard（分镜/镜头，扁平化存储）
                    ├── VideoPrompt（视频生成指令）
                    └── ImagePrompt（图像生成指令）
```

### 4.3 资产体系
```
Project
  └── Asset（角色/场景/道具/特效）
        └── AssetVariant（变体，含 attributes JSONB）
              └── AssetResource（图片/模型文件，存 MinIO）
```

### 4.4 资产绑定
```
AssetBinding → Episode（集级绑定）
AssetBinding → Storyboard（镜头级绑定）
ShotAssetRelation → Storyboard + Asset + AssetVariant
```

### 4.5 AI 模型管理
```
AIModelConfig（厂商+模型+加密 API Key）
  └── AIModelBinding（binding_key → 模型配置映射）
AIUsageEvent（调用记录，含积分消耗）
```

### 4.6 其他实体
- `FileNode`：虚拟文件系统（VFS），支持项目级文件树
- `AIPromptPreset`：用户级提示词预设
- `QCReport`：质检报告
- `AssetTag` / `AssetTagRelation`：资产标签系统

---

## 5. AI 能力架构

### 5.1 AI 网关（`app/ai_gateway/`）
统一封装三类 AI 调用，支持积分扣费、错误重试、用量记录：

| 类型 | 默认 binding_key | 支持厂商 |
|------|-----------------|---------|
| 文本（LLM） | `chatbox` | OpenAI 兼容（任意 base_url） |
| 图像生成 | `image` | OpenAI、Gemini、Doubao SeedDream、Kling |
| 视频生成 | `video` | Kling、Vidu、Aliyun Wanxiang |

支持流式输出（SSE）和非流式两种模式。

### 5.2 场景引擎（`app/scene_engine/`）
可注册的 AI 场景，当前内置：
- `chat`：通用对话
- `script_split`：剧本按集拆分
- `episode_characters`：集级角色提取

### 5.3 异步任务系统（`app/tasks/`）
基于 Redis `brpop` 的自研任务队列，支持 WebSocket 实时进度推送（`/ws/tasks`）。

当前注册的 17 种任务类型：

| 任务类型 | 功能 |
|---------|------|
| `episode_storyboard_agent_apply` | AI 生成分镜 |
| `episode_asset_agent_apply` | AI 资产提取（全量） |
| `episode_character_agent_apply` | AI 角色提取 |
| `episode_prop_agent_apply` | AI 道具提取 |
| `episode_scene_agent_apply` | AI 场景提取 |
| `episode_vfx_agent_apply` | AI 特效提取 |
| `episode_asset_extraction_preview` | 资产提取预览 |
| `episode_scene_structure_preview` | 场景结构预览 |
| `freeform_asset_extraction_compare_preview` | 自由格式资产对比预览 |
| `scene_storyboard_preview` | 场景分镜预览 |
| `asset_image_generate` | 资产图片生成 |
| `shot_video_generate` | 镜头视频生成 |
| `apply_plan_execute` | 执行 AI 计划 |
| `ai_scene_test_chat` | AI 场景测试对话 |
| `episode_doc_backfill` | 集文档回填 |
| `user_app_run` | 用户 App 运行 |
| `noop` | 空操作（测试用） |

---

## 6. 前端页面模块

| 路由 | 功能 |
|------|------|
| `/dashboard` | 工作台概览 |
| `/projects` | 项目归档列表 |
| `/scripts` | 剧本上传与管理 |
| `/assets` | 资产库（角色/场景/道具/特效） |
| `/extraction` | AI 资产提取工具 |
| `/storyboard` | 分镜/故事板创作（全屏） |
| `/studio` | 创作工坊（无限画布，全屏） |
| `/ai-scenes` | AI 场景测试与管理 |
| `/chat` | AI 助手对话 |
| `/tasks` | 异步任务清单与进度 |
| `/settings` | 系统设置（模型引擎/用户/角色/权限/审计） |
| `/my-agents` | 用户自定义 Agent |

---

## 7. API 路由概览（`/api/v1/`）

后端 API 按功能模块拆分为 35+ 个路由文件，主要包括：

**内容创作类：**
- `/scripts` - 剧本 CRUD + 文件上传
- `/episodes` - 集管理
- `/scenes` - 场次管理
- `/storyboards` - 分镜管理
- `/assets` - 资产 CRUD
- `/asset-bindings` - 资产绑定
- `/apply-plans` - AI 计划执行

**AI 能力类：**
- `/ai-text` - 文本生成
- `/ai-image` - 图像生成
- `/ai-video` - 视频生成
- `/ai-media` - 媒体生成（统一入口）
- `/ai-scenes` - AI 场景管理
- `/ai-scene-runner` - 场景运行
- `/ai-scene-test` - 场景测试
- `/ai-chat-sessions` - AI 对话会话
- `/ai-asset-extraction` - AI 资产提取
- `/ai-storyboard` - AI 分镜生成
- `/ai-model-configs` - 模型配置管理
- `/ai-catalog` - AI 目录

**系统管理类：**
- `/users` - 用户管理
- `/admin` - 管理员操作
- `/credits` - 积分系统
- `/tasks` - 任务管理
- `/agents` - Agent 管理
- `/user-agents` - 用户 Agent
- `/storage/vfs` - 虚拟文件系统

---

## 8. 存储架构

MinIO 三个 Bucket：
| Bucket | 用途 | 权限 |
|--------|------|------|
| `anyreason-scripts` | 原始剧本文件 | Private |
| `anyreason-assets` | 资产图片/模型 | Public Read / Presigned URL |
| `anyreason-exports` | 导出成品 | Private |

路径规范：
- 剧本：`scripts/{user_id}/{script_id}/{filename}`
- 资产：`assets/{asset_id}/{variant_code}/{filename}`

---

## 9. 开发工作流

### 启动方式
```powershell
# 仅启动基础设施（推荐本地开发）
cd docker && docker compose up -d

# 后端
cd fastapi_backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 前端
cd nextjs-frontend
pnpm install && pnpm dev

# 任务 Worker
cd fastapi_backend
uv run python -m app.tasks.worker --reload
```

### OpenAPI 契约同步
```powershell
# 1. 后端生成 openapi.json
cd fastapi_backend && uv run python -m commands.generate_openapi_schema

# 2. 前端生成 typed client
cd nextjs-frontend && pnpm generate-client
```

### 数据库迁移
```powershell
cd fastapi_backend
uv run alembic upgrade head
```

---

## 10. 关键设计决策

1. **ID 同构**：`Project.id == Script.id`，剧本即项目
2. **UUID + 业务编码双轨**：数据库关联用 UUID，URL 和人工识别用 `EP001_SC01_SH01` 格式
3. **JSONB 灵活字段**：`AssetVariant.attributes`、`Storyboard.active_assets`、`Scene.z_depth` 等
4. **存算分离**：数据库只存 `minio_bucket + minio_key`，不存 URL
5. **AI 网关统一**：所有 AI 调用经过 `AIGatewayService`，统一处理积分扣费、错误处理、用量记录
6. **任务系统自研**：基于 Redis brpop，支持 WebSocket 实时进度，不依赖 Celery（Celery 为可选）
7. **OpenAPI 契约驱动**：前端 typed client 由后端 OpenAPI schema 自动生成，保证类型安全
8. **VFS（虚拟文件系统）**：`FileNode` 表支持项目级文件树，资产文档通过 `doc_node_id` 关联

---

## 11. 当前已实现 vs 规划中

### 已实现
- 用户鉴权（JWT Cookie）+ RBAC 权限体系
- 剧本上传与 AI 结构化解析（按集/场拆分）
- 资产管理（角色/场景/道具/特效）+ 变体 + 资产绑定
- AI 分镜生成（Storyboard）
- AI 资产提取（4 种类型独立任务）
- AI 网关（文本/图像/视频，支持 Volcengine/Aliyun/Vidu/Gemini/Kling）
- 积分系统（消费/退款/记录）
- 异步任务系统 + WebSocket 实时进度
- AI 场景测试框架
- 虚拟文件系统（VFS）
- 用户 Agent 系统

### 规划中（来自 `项目功能规划.md`）
- 无限画布（已有 `InfiniteCanvas.tsx` 骨架）
- 图生视频完整闭环
- 配音与口型同步
- 成片导出（MP4/XML/PR）
- 团队协作与任务分工
- 成本报表与用量统计
- ComfyUI / liblib 工作流对接
