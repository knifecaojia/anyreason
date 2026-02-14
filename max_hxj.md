# max_hxj｜把“言之有理”从 0 做到能跑的那条路

你可以把这个项目想象成一条漫剧生产线：原材料是“灵感/剧本/提示词/素材”，中间是“资产/分镜/流程编排”，最后的成品是“可导出的视频/工程文件”。我们现在做的不是立刻造出整条生产线，而是先把厂房、水电、门禁、出入库系统搭起来——否则后面每加一台机器都要返工。

这份文档讲的是：当前仓库的**开发基线**到底是什么、为什么这么选、各部分怎么连在一起，以及你将来最容易踩的坑有哪些。

## 基线信息（先对齐口径）
- **项目名**：言之有理（anyreason）
- **版本**：0.0.1
- **功能性说明基线**：[项目功能规划.md](file:///f:/animate-serial/apps/anyreason/%E9%A1%B9%E7%9B%AE%E5%8A%9F%E8%83%BD%E8%A7%84%E5%88%92.md)
- **Agent 基线**：[agent.md](file:///f:/animate-serial/apps/anyreason/agent.md)

---

## 1）我们到底要交付什么（基线视角）

在 `tech-route-fast-delivery.md` / `fixed-goal.md` 里，项目的硬约束很明确：
- 轻量化、前后端分离
- 后端 FastAPI
- 数据库 Postgres
- 对象存储 MinIO
- 前端 shadcn/ui + Tailwind

所以“基线”的标准不是功能多，而是：
1. **能启动**（本地依赖一键拉起）
2. **能登录**（账号体系先跑通）
3. **有一个可进入的工作区**（Dashboard 占位页，后面把模块往里塞）
4. **前后端契约不容易漂**（OpenAPI 自动生成 typed client）

这些东西就像地基：地基稳，后面扩建才不会一层一层塌。

补一句“上层建筑”的蓝图：当你在想“这个平台最终要长什么样”，请以 [项目功能规划.md](file:///f:/animate-serial/apps/anyreason/%E9%A1%B9%E7%9B%AE%E5%8A%9F%E8%83%BD%E8%A7%84%E5%88%92.md) 为准——它定义了从创意到成片的主流程，以及 RBAC、模型/Provider、资产库、画布、分镜、导出、成本统计等一级模块。

---

## 2）为什么我们选择 nextjs-fastapi-template 作为骨架

它的价值，不是帮你写“漫剧业务”，而是把“现代全栈工程”的麻烦事一次性解决掉：
- 后端：FastAPI + 完整 async 体系（路由/DB/测试尽量一致）
- 鉴权：基于 `fastapi-users` 的账号体系与 JWT 能力（你不用从 0 写登录/找回密码）
- 前端：Next.js + TypeScript + Zod，配套 shadcn/ui + Tailwind
- 契约：OpenAPI → typed client（你改了后端接口，前端生成出来的 SDK 会跟着变）

一句话：我们把“软件工程的脚手架”外包给成熟模板，把精力留给“漫剧生产线的业务抽象”。

---

## 3）当前代码库结构（你从哪里开始看）

仓库根目录下，你最常碰的几块：
- `fastapi_backend/`：后端服务（FastAPI）
- `nextjs-frontend/`：前端服务（Next.js）
- `docker/`：本地依赖与（可选）应用容器启动
- `local-shared-data/`：前后端共享的生成物（目前主要是 `openapi.json`）
- `refs/`、`*.md`：需求/规划/参考资料（用来指导后续模块落地）

你可以这样理解连接关系：
- 后端暴露 OpenAPI（以及 Swagger `/docs`）
- 后端把 OpenAPI 导出到 `local-shared-data/openapi.json`
- 前端用 `pnpm generate-client` 把这个文件生成成 `nextjs-frontend/app/openapi-client`
- 前端页面/Server Actions 调用 typed client，完成登录等动作

---

## 3.5）数据库设计说明书（Manju v3.0）

如果把“言之有理”想成一间漫剧工厂，那数据库就是：
- 一半像仓库（资产、版本、资源路径）
- 一半像场记本（剧集/分场/分镜/提示词/质检）

我们这套设计的目标很明确：**能工业化迭代**。也就是：数据结构要稳、能追溯、能扩展、能做反查；同时别把未来的“模型接入/导出/质检流水线”堵死。

### 1）关键原则（你读懂这一段，后面就不会迷路）

**A. 双轨 ID：内部 UUID + 业务编码**
- 表与表之间用 UUID 外键保证引用完整性（机器友好）
- 同时保留 `episode_code/scene_code/shot_code/asset_id` 这类可读编码（人类友好、导出友好）

**B. 资产 EVR（实体-变体-资源）三级模型**
- `assets`：只放“这个资产是谁”（身份、类型、基础分类、生命周期）
- `asset_variants`：放“这个资产在某个阶段/年龄/状态下长什么样”（多变属性 JSONB、提示词模板）
- `asset_resources`：只放“文件在哪里”（MinIO bucket + key + 元信息），坚决不存二进制

**C. 动静分离：列式化检索字段 + JSONB 承载可变属性**
- 列（Columns）：用于过滤/排序/约束（如 `type/category/lifecycle_status/stage_tag`）
- JSONB：用于承载频繁变化的细节（如角色 hair/eyes/clothing，场景 z_depth/weather/light 等）

**D. 关系必须可反查：桥接表优先于“数组塞一列”**
- `shots.active_assets` 作为 schema 兼容/入库过渡仍保留
- 但真正支撑“资产出现统计/反向查询/资产状态跟踪”的是 `shot_asset_relations`

### 2）表清单（按生产分层组织）

落地模型位置：后端 [models.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/models.py)

**L0：项目与账号（平台地基）**
- `user`：账号体系（来自 fastapi-users）
- `projects`：项目容器，后续所有内容对象都挂在项目下

**L1：资产中心（Asset Registry）**
- `assets`：资产实体（Entity/Master）
  - 关键字段：`asset_id / name / type / category / lifecycle_status`
  - 约束：`(project_id, asset_id)` 唯一
- `asset_variants`：资产变体（Variant）
  - 关键字段：`variant_code / stage_tag / age_range / attributes(JSONB) / prompt_template / is_default`
  - 约束：`(asset_entity_id, variant_code)` 唯一
- `asset_resources`：资产资源（Resource）
  - 关键字段：`res_type / minio_bucket / minio_key / meta_data(JSONB)`

**L2：剧集（脚本入口与阶段）**
- `episodes`：剧集（含源码映射）
  - 关键字段：`episode_code / episode_number / start_line / end_line / word_count / status / stage_tag`
  - `stage_tag` 用于“自动选变体”

**L3：分场（空间与叙事环境）**
- `scenes`：分场
  - 关键字段：`scene_code / location_type / z_depth(JSONB) / key_events(JSONB) / content`
  - `location_type` 有 CHECK 约束（内/外/内外）

**L4：分镜（导演与运镜）**
- `shots`：分镜
  - 关键字段：`shot_code / shot_type / camera_angle / camera_move / narrative_function / duration_estimate`
  - `active_assets(JSONB)`：兼容字段
- `shot_asset_relations`：分镜-资产桥接（核心反查能力）
  - 关键字段：`shot_id / asset_entity_id / asset_variant_id / state(JSONB)`
  - 能力：
    - 一个分镜绑定多个资产
    - 一个资产出现在多个分镜（反向查询“某资产在哪些镜头出现”）
    - 资产在镜头里的状态可记录在 `state`（如 `is_damaged=true`）
    - 个别镜头可显式覆盖 `asset_variant_id`（闪回/回忆/特写造型变更）

**L5：生成执行层（对接模型）**
- `video_prompts`：视频提示词与生成参数
  - 关键字段：`prompt_main / negative_prompt / style_model / aspect_ratio / character_prompts(JSONB) / camera_settings(JSONB)`
- `ai_model_configs`：平台级模型配置（text/image/video），包含 base_url 与加密 api_key
- `ai_model_bindings`：用途 key → 默认模型配置绑定（例如 `chatbox` / `image` / `video`）
- `agents`：业务 Agent，按类别绑定 `ai_model_config_id`，并可配置扣积分策略

**门禁/质检**
- `qc_reports`：跑批质检报告（整包 JSON 入库，便于迭代比对）

**资产标签（检索/聚类）**
- `asset_tags`：项目内标签字典（`project_id + name` 唯一）
- `asset_tag_relations`：资产-标签关系（`asset_entity_id + tag_id` 唯一）

### 3）关系图（用一句话记住每条线）

- Project → Episode → Scene → Shot → VideoPrompt：这是“剧本拆解到生成执行”的主干
- Project → Asset → AssetVariant → AssetResource：这是“资产从身份到版本到文件”的主干
- Shot ↔ Asset（通过 shot_asset_relations）：这是“分镜需要哪些资产”的真实索引
- Asset ↔ Tag（通过 asset_tag_relations）：这是“资产的标签检索与聚类”

### 4）索引与约束（为什么这么做）

这套索引/约束看起来啰嗦，但它们是在帮你“提前阻止生产事故”：
- 业务编码唯一约束（例如 `(project_id, asset_id)`）：避免导出时出现两个同名资产
- CHECK 约束（如 `assets.lifecycle_status`、`scenes.location_type`）：把错误关在数据库门外
- 关系表唯一约束（如 `shot_asset_relations(shot_id, asset_entity_id)`）：避免同一个镜头重复绑定同一资产造成统计错乱

### 5）MinIO 解耦与资源路径规范（落到 DB 的方式）

数据库只存路径（bucket + key），像是仓库里的“货位号”，而不是把整箱货物塞进账本里：
- `asset_resources.minio_bucket`
- `asset_resources.minio_key`
- `asset_resources.meta_data`：分辨率、时长、文件哈希、生成参数摘要等

后端需要给前端/AI 引擎提供访问时，应当：
1) 从 DB 读取 bucket/key
2) 用 MinIO SDK 生成有时效的 Presigned URL

### 6）迁移与演进（你该怎么升级而不炸库）

迁移文件在：
- [7c2f0f2a1d9e_add_manju_script_hierarchy_tables.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/alembic_migrations/versions/7c2f0f2a1d9e_add_manju_script_hierarchy_tables.py)
- [9f0c1b8d1a2e_asset_evr_and_shot_asset_relations.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/alembic_migrations/versions/9f0c1b8d1a2e_asset_evr_and_shot_asset_relations.py)
- [2ab7f3f1e2d4_asset_tags_and_relations.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/alembic_migrations/versions/2ab7f3f1e2d4_asset_tags_and_relations.py)

推荐习惯：
- 新增字段优先“可空 + 默认值”，让线上数据可平滑过渡
- 需要从 JSONB 里抽出可检索字段时，先加列并回填，再慢慢迁移读写
- 需要强一致反查时（例如资产出现统计），优先落桥接表，不要只靠 JSON 数组

---

## 3.6）剧集内容：DB 与 VFS 的“双栖”存储（以及为什么你会感觉有点拧巴）

很多人第一次看这个仓库会困惑：**同样是“剧集”，为什么既在数据库里，又在 VFS（虚拟文件系统）里？**

你可以把它类比成：
- **数据库**像“索引卡片盒”：适合筛选、排序、联表、做权限与任务流状态管理
- **VFS（file_nodes + MinIO）**像“文件柜”：适合放“人类可读、可版本化、可导出”的正文与产物

当前实现里，这两套系统都存在，但负责的东西不完全一致。

### A. 数据库里到底存了什么（episodes / storyboards）

以 `episodes` 表为例（后端 [models.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/models.py)）：
- `episode_code / episode_number / title`：这类是稳定索引与展示字段
- `start_line / end_line / word_count`：用于“源码映射”（从上传的剧本全文里切片）
- `script_full_text`：**把该集的剧本文本直接存入 DB**，便于 UI/Agent 直接读
- `storyboard_root_node_id / asset_root_node_id`：**把“该集 AI 产物输出目录”挂到 VFS 的节点**

再往下一级：
- `storyboards` 表存的是“镜头条目”的结构化结果（shot_code、scene_number、description 等）

把这块串起来的关键流程是 [script_structure_service.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/services/script_structure_service.py)：
1) 剧本文件先上传到 MinIO（scripts 表里存 bucket/key）
2) 后端把 MinIO 文本读出来，解析成分集
3) 分集写入 `episodes`，并“删旧重建”对应的 `storyboards`

### B. VFS 里到底存了什么（分集/资产/绑定/故事板）

VFS 的核心是 `file_nodes` 表（“目录树”）+ MinIO（“文件内容”），见 [models.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/models.py) 与 [vfs_service.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/services/storage/vfs_service.py)。

目前主要有两类写入路径：

**1）Apply Plan（Chatbox 的“预览落库”工具链）写入**

后端入口是 [apply_plans.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/api/v1/apply_plans.py)，会在项目根目录创建/复用三棵树：
- `分集/`：写 `EPxxx*.md`
- `资产/`：按“角色/道具/地点/特效”子目录写 `*.json`
- `绑定/`：写 `EPxxx_bindings.json`

这些文件对应的“文档结构”在 [vfs_docs.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/vfs_docs.py)。

**2）异步 Task（Agent Apply）写入**

例如故事板 apply：[episode_storyboard_agent_apply.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/tasks/handlers/episode_storyboard_agent_apply.py)
- 先确保 `episode.storyboard_root_node_id` 指向一个 VFS 文件夹
- 调用 Agent 生成多个 Markdown 对象（用 `---` 分隔）
- 每个对象写成一个 `001_xxx.md` 文件

资产相关 apply（多处复用的工具函数在 [episode_asset_apply_utils.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/tasks/handlers/episode_asset_apply_utils.py)）也类似。

### C. 这里“拧巴”的点是什么（也是你提到的“结构化不一致”的根源之一）

当前现状本质上是：  
**数据库里有一份“可查询的结构化文本（script_full_text/storyboards）”，VFS 里又在生成另一套“面向人类阅读/导出”的文档。**

这会带来三个典型问题：
1) **单一事实来源（SSOT）不清晰**：到底以 DB 为准还是以 Markdown 为准？
2) **产物散落**：Apply Plan 的“分集/资产/绑定”是一套目录；Task 的“故事板/资产”是另一套目录（并且以 node_id 绑定，不一定有统一的可视层级）
3) **AI 一旦不稳定，结构化表就会痛苦**：解析/约束会变成“和模型输出对抗”的工作

这也正好解释了你提的倾向：把“正文”统一成 Markdown，把 DB 降级成轻量 meta/索引。

---

## 3.7）更合理的 Dry Run：让 AI 先把“要写什么”摆在桌面上

仓库里其实已经有一个很有价值的设计：**ApplyPlan**（见 [apply_plan.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/ai_tools/apply_plan.py)）。

它的意义是：  
让 Agent 先产出一个“写入计划”（包含 preview），人类看完觉得对，再调用后端执行写入。

目前的问题主要不在后端，而在“预览怎么呈现”。为此我补了一步：在前端的 **AI 场景测试**页面，把每个 plan 的关键信息（文件名/内容/可复制文本）展开显示，避免只能看一个大 JSON 才知道写入了什么。

对应页面位置：  
- [ai-scenes/page.tsx](file:///f:/animate-serial/apps/anyreason/nextjs-frontend/app/(aistudio)/ai-scenes/page.tsx)

这套 Dry Run 流程建议固定成 3 段式：
1) **提取（Preview Task）**：只跑预览 handler（比如资产提取预览），把 raw 输出和结构化结果都返回
2) **计划（ApplyPlan dry_run）**：把“将写入哪些文件、文件名是什么、内容长什么样”组成 plan.preview
3) **应用（Execute）**：用户确认后再写入 VFS（并在 UI 明确提示“会覆盖哪些文件/会新增哪些文件”）

## 4）运行方式：两条路（都保留）

### 路 A：一键起全栈（推荐）

### 路 A：一键起全栈（推荐）

在 `docker/` 里使用两份 compose：
- `docker-compose.yml`：基础设施（Postgres + MinIO + 可选 Redis）
- `compose.app.yml`：应用服务（backend + frontend）

这样拆分的好处是：当你在第 1-2 周只想做“数据结构 + 依赖服务”，可以只跑基础设施；到了联调期再把应用一起拉起来。

### 路 B：只容器化依赖，应用跑本机

很多团队习惯这样开发：数据库/对象存储放 Docker，代码跑本机，调试最顺手。

---

## 5）“登录 + 空白 Dashboard”在哪里

前端：
- 登录页：`nextjs-frontend/app/login/page.tsx`
- Dashboard：`nextjs-frontend/app/dashboard/page.tsx`

当前 Dashboard 被刻意做成“占位页”，因为我们的业务主界面将来要承载：
- 项目生命周期（项目/阶段/里程碑/状态流转）
- Provider/模型管理（类似 dify）
- 资产库（角色/场景/道具/特效 + 版本 + 引用快照）
- 画布（React Flow 节点/连线/属性面板）
- 分镜/故事板（四区结构）
- 导出任务（状态机 + 产物回流）

占位页的意义：让你每次启动后都有一个稳定入口，不必为了 UI 纠结太早。

---

## 6）你将来一定会遇到的坑（以及怎么提前躲开）

### 坑 1：Python 版本“明明装了却跑不起来”

模板后端用 `uv` 管依赖，并要求 Python 3.12（当前通过 `uv python install 3.12` 解决）。  
建议：把“后端运行时版本”当成**项目契约**，不要在不同机器上各跑各的版本。

### 坑 2：前后端接口改着改着就崩了

没有 typed client 的项目，最常见的事故是：后端字段改名/分页格式变了，前端静悄悄地坏掉。  
解决：坚持 OpenAPI → client 生成这条链路，把“契约漂移”变成编译期问题。

### 坑 3：对象存储先不设计，后面一定返工

MinIO 不是“先放着再说”，一旦资产版本、引用快照、删除策略没定，后面分镜/导出会被连带拖死。  
建议：尽早把对象存储路径规范与 DB 关系定下来（你在 `tech-route-fast-delivery.md` 里已经写了方向）。

### 坑 4：把 RBAC 当成“加个中间件就完了”

RBAC 的难点不在“校验一次权限”，而在：
- 组织/项目边界
- 资源与动作的建模
- 审计与可追溯
- 与业务对象（项目/资产/镜头）的关联

建议：先做数据结构与最小权限闭环，再扩。

---

## 7）下一步该怎么加业务（给未来的你一张地图）

当你准备开始做真正的“言之有理”，推荐顺序依然是：
1. RBAC 数据结构与鉴权闭环（A）
2. 项目生命周期（A 的最直接落点）
3. Provider/模型管理（统一 AI 接入与调用审计）（B）
4. 资产管理 + MinIO 绑定（C）
5. 画布（D）→ 分镜/故事板（E）→ 导出任务（F）

如果你只记一句：**先让流程跑通，再让效果变好看。**

---

## 8）文件索引（常用入口）

- Agent 基线：[agent.md](file:///f:/animate-serial/apps/anyreason/agent.md)
- 后端配置：[config.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/config.py)
- 后端启动入口：[main.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/main.py)
- OpenAPI 导出脚本：[generate_openapi_schema.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/commands/generate_openapi_schema.py)
- 前端 Dashboard：[page.tsx](file:///f:/animate-serial/apps/anyreason/nextjs-frontend/app/dashboard/page.tsx)
- Docker 启动说明：[docker/README.md](file:///f:/animate-serial/apps/anyreason/docker/README.md)
