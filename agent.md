# Agent 基线｜言之有理（anyreason）0.0.1

## 0. 元信息
- **项目名**：言之有理（anyreason）
- **项目类型**：AI 漫剧创作管理平台
- **版本**：0.0.1
- **基线目标**：先把前后端骨架、鉴权、类型契约、统一运行方式搭起来，在此之上逐步接入 RBAC、模型/Provider、资产库、画布与分镜、导出闭环。

## 1. 信息来源（权威顺序）
1. [项目功能规划.md](file:///f:/animate-serial/apps/anyreason/%E9%A1%B9%E7%9B%AE%E5%8A%9F%E8%83%BD%E8%A7%84%E5%88%92.md)：业务功能规划与端到端流程设计（本项目业务基线）。
2. [README.md](file:///f:/animate-serial/apps/anyreason/README.md)：当前代码基线已实现的工程能力与启动方式（本项目工程基线）。

## 2. 产品定位（一句话）
- 面向漫剧创作企业的 AI 协同生产平台：覆盖“创意 → 剧本 → 资产 → 分镜 → 成片”的全流程，并以标准化 SOP + 可复用 Agent 能力，把产物、门禁与质检工程化、可度量、可扩展。

## 3. 用户与角色（业务侧）
- 企业管理者：组织/项目管理、权限与成本、进度把控
- 策划：创意生成、剧本拆解、提示词管理
- 美术：角色/场景/道具/特效资产一致性
- 导演：分镜节奏、镜头调度、故事板审核
- 编辑/剪辑：素材导出、成片管理、投放版本管理

## 4. 核心模块（一级功能清单）
1. 账号与权限（RBAC）：组织/团队/项目级；角色-资源-动作三级
2. 项目生命周期管理：阶段推进、里程碑、状态流转
3. 剧集基础信息与全局设置：比例/风格/默认模型/全局提示词与模板
4. AI 模型与 Provider 管理：统一注册与配置中心；覆盖 LLM/图像/视频/音频/多模态
5. 拖拽式创作画布（无限画布）：剧本分析、分镜流程、素材链路可视化
6. 资产管理：角色/场景/生物/道具/特效/音色；版本/引用/一致性；锁定与分享
7. 分镜与故事板：场景拆分、镜头管理、镜头参数化生成
8. 团队协作与任务管理：任务分工、进度跟踪、审核流
9. 素材导出与成片管理：MP4/XML/PR 工程等导出，版本管理
10. 模型编排与外部工作流衔接：对接 ComfyUI/liblib 等
11. 成本与用量统计：模型调用量、费用/积分、人员消耗分布

## 5. 核心流程（从“创意”到“成片”）
- 4.0 剧集创建与全局设置：比例/风格/默认模型/全局提示词
- 4.1 创意与题材定位：创意简报、主角设定、情绪走向
- 4.2 剧本生成与拆解：大纲→分集→分场；拆解到“镜头级”结构数据
- 4.3 资产设计：自动识别实体→资产提示词→版本与锁定→可视化资源包
- 4.4 分镜与故事板：镜头拆解→镜头提示词与运镜→四区故事板创作与审核
- 4.5 图生视频与配音：镜头级视频、音色库、口型同步
- 4.6 高效版一键流程：分析/图片/视频/旁白异步任务闭环
- 4.7 成片导出与审核：多格式导出、素材打包、逐帧批注与审核流

## 6. 技术与实现约束（工程侧）
- **后端**：Python + FastAPI（异步）、OpenAPI 输出
- **数据库**：PostgreSQL
- **对象存储**：MinIO
- **前端**：Next.js + shadcn/ui + Tailwind + TypeScript
- **契约**：OpenAPI → 前端 typed client（减少契约漂移）
- **架构要求**：前后端分离、轻量化、低耦合、可扩展

## 7. 版本 0.0.1 的“已落地”范围（现实边界）
- 已具备工程骨架：前端基础页面（登录/Dashboard 占位）、后端账号体系/鉴权、OpenAPI→typed client 生成链路、本地依赖（Postgres/MinIO/可选 Redis）一键拉起。
- 业务模块（RBAC/Provider/资产/画布/分镜/导出等）以 [项目功能规划.md](file:///f:/animate-serial/apps/anyreason/%E9%A1%B9%E7%9B%AE%E5%8A%9F%E8%83%BD%E8%A7%84%E5%88%92.md) 为准，尚在逐步实现中。

## 8. 名词对照（用于减少歧义）
- **剧集**：创作与生产的最小“内容单位”，包含全局设置、剧本、资产、分镜、成片等
- **镜头**：分镜层级的最小执行单元，绑定画面提示词、运镜参数与产物（图/视频/音频）
- **资产**：角色/场景/道具/特效/音色等可复用对象，要求版本化与一致性
- **Provider**：具体模型服务提供方与其配置
- **模型编排**：将多模型调用以工作流/节点形式组织并可追溯执行
- **门禁/质检**：在 SOP 每个阶段对产物做自动/半自动 QA，阻止低质量进入下游

## 9. 通过“沙箱”启动项目（本机联调：后端 + Worker + 前端）

这里的“沙箱”指：**支撑系统（Postgres / Redis / MinIO）已经在本机运行**，应用服务（后端 / Worker / 前端）在本机启动，用于快速联调与调试。

### 9.1 前置检查

- Postgres：`localhost:5432`
- Redis：`localhost:6379`
- MinIO API：`http://localhost:9000`（控制台通常是 `http://localhost:9001`）

如果上述基础设施未启动，可参考 [README.md](file:///f:/animate-serial/apps/anyreason/README.md) 的“本机运行（不使用应用容器）”章节先拉起依赖。

### 9.2 启动后端（FastAPI，8000）

在 PowerShell 中执行：

```powershell
cd .\fastapi_backend
Copy-Item .\.env.example .\.env -ErrorAction SilentlyContinue
uv python install 3.12
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

验证：
- Swagger：`http://localhost:8000/docs`

### 9.3 启动 Worker（任务执行）

新开一个 PowerShell 窗口执行：

```powershell
cd .\fastapi_backend
Copy-Item .\.env.example .\.env -ErrorAction SilentlyContinue
uv sync
uv run python -m app.tasks.worker --reload
```

启动成功后，日志会打印类似 `known task types:` 的任务类型列表。

### 9.4 启动前端（Next.js，3000）

新开一个 PowerShell 窗口执行：

```powershell
cd .\nextjs-frontend
Copy-Item .\.env.example .\.env -ErrorAction SilentlyContinue
Copy-Item .\.env.local.example .\.env.local -ErrorAction SilentlyContinue
pnpm install
pnpm dev
```

验证：
- 前端：`http://localhost:3000`

### 9.5 常见联调要点

- 前端调后端：优先检查 `nextjs-frontend/.env` 或 `.env.local` 中 `NEXT_PUBLIC_API_BASE_URL` 是否指向 `http://localhost:8000`
- 后端连基础设施：优先检查 `fastapi_backend/.env` 中 `DATABASE_URL` / `REDIS_URL` / `MINIO_ENDPOINT`（是否为本机地址/端口）
- 需要默认管理员账号：在 `fastapi_backend/.env` 中开启 `CREATE_DEFAULT_ADMIN=true`，并设置 `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`（见 [README.md](file:///f:/animate-serial/apps/anyreason/README.md)）
