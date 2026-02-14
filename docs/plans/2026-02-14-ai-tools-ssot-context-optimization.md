# AI 工具 / SSOT / 上下文注入整体优化方案 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 以 Markdown-first 的方式统一 AI 产物（资产/分集/故事板/运行记录）为 SSOT，并在现有 ApplyPlan + VFS 基础设施上补齐“上下文注入 + 变体判定 + 可审计执行”的闭环。

**Architecture:** 保留“LLM function calling → 产出 ApplyPlan（预览）→ 统一入口执行（落地）”的两段式结构，新增 Context Builder（上下文构建）与 Plan Normalize（计划归一化），并以 VFS Markdown 作为主要可读产物与长期 SSOT。<mccoremem id="03fl12evlz1tajmiw02h1e812" />

**Tech Stack:** FastAPI + pydantic_ai + SQLAlchemy + MinIO(VFS) + Next.js(react-markdown)

---

## 0. 背景与现状（来自现有实现）

现有关键事实（用于对齐方案边界）：
- 工具机制：pydantic_ai tools 以 JSON 入参调用（Chatbox 显式 JSON 入参；场景测试以 `ctx.deps` 隐式入参）。见 [2026-02-14-agent-内置工具输入说明.md](file:///f:/animate-serial/apps/anyreason/docs/reports/2026-02-14-agent-%E5%86%85%E7%BD%AE%E5%B7%A5%E5%85%B7%E8%BE%93%E5%85%A5%E8%AF%B4%E6%98%8E.md)
- ApplyPlan：工具多以 ApplyPlan 表达“将要写入的产物”，执行端统一写入 VFS。见 [apply_plan.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/ai_tools/apply_plan.py)、[apply_plans.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/api/v1/apply_plans.py)
- VFS：`file_nodes` 存元数据，MinIO 存内容，支持 `create_text_file` 写 Markdown/JSON。见 [vfs_service.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/services/storage/vfs_service.py)
- 资产模型（DB 已具备 EVR 结构）：`assets → asset_variants → asset_resources`。见 [models.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/models.py#L369-L472)
- 场景测试工具以 `preview_*` 产出 ApplyPlan，但当前执行端只支持 `episode_save/asset_create/asset_bind` 三类 “正式 tool_id”。见 [ai_scene_test/tools.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/ai_scene_test/tools.py)、[apply_plans.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/api/v1/apply_plans.py)

当前痛点（需要被该方案解决）：
- 资产的非稳定属性目前通过 JSON `meta` 承载，不符合“Markdown-first 预览/存储”的目标。见 [vfs_docs.py](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/vfs_docs.py)
- 资产/变体判定缺少可审计的“上下文注入 + 判定决策”闭环，目前只有轻量 name 相似度去重预览。见 [asset_deduplicator_preview](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/ai_tools/chatbox_tools.py#L158-L179)
- 上下文注入（把历史落库资产喂给 agent）目前没有统一构建器、没有 UI 分层配置、也没有运行快照可追溯。

---

## 1. 设计目标（必须满足）

1) **Markdown-first SSOT**：用户可读产物（资产/变体、分集、故事板、运行记录）以 Markdown 为主，结构化字段最小化。<mccoremem id="03fl12evlz1tajmiw02h1e812" />
2) **可执行与可审计**：AI 决策必须输出结构化“可执行外壳”（ApplyPlan 或同构对象），并同时生成 Markdown 理由与上下文快照。
3) **上下文注入可配置但分层**：默认策略项目级生效（默认全量注入），每次运行可覆盖；UI 必须展示“注入了什么”。
4) **少硬编码**：硬编码仅用于“上下文选择的最小机制”和“落地格式/目录规范”，判定逻辑由 agent 负责并输出可解释证据。

---

## 2. SSOT 分层与职责（最终形态）

### 2.1 DB（索引层）
只保存需要查询/关联/事务一致性的字段：
- 项目/剧集/镜头的 id、编号、状态、统计值
- 资产实体/变体/资源的 id 与生命周期、引用关系（EVR）
- 指向 VFS 文档的 node_id 指针（“正文/说明书/运行记录”）

注意：该方案建议新增/补齐若干 “指向 VFS 的 node_id” 字段（例如 `episode_doc_node_id`、`asset_doc_node_id`、`variant_doc_node_id`）。这涉及 DB 结构变更时，需要同步更新 `docs/数据库设计规范.md`（仓库规约）。  

### 2.2 VFS（文档/产物层，Markdown SSOT）
VFS 存：
- 资产与变体说明书（Markdown）
- 分集文档（Markdown）
- 故事板/镜头文档（Markdown）
- AI 运行归档（run.md + run_context.md + plan.json）

### 2.3 AI 工具（计划层）
工具只产出：
- 可执行计划（ApplyPlan.inputs）
- 可读解释（reason_md/diff_md）
- 可追溯上下文快照（context_md 或 context_refs）

落地统一由执行端完成（API/任务 worker）。

---

## 3. VFS 目录与 Markdown 文档规范（建议作为平台契约）

### 3.1 目录布局（建议新增“AI 运行归档”）
在现有 `分集 / 资产 / 绑定 / 故事板` 之外新增：
- `AI/`：每一次 agent 运行的归档目录

建议目录结构（示例）：
- `资产/角色/<asset_key>_<name>.md`
- `资产/角色/<asset_key>_<name>/variants/<variant_key>.md`（可选，按需拆分）
- `分集/EP010_标题.md`
- `故事板/EP010/001_...md`（建议把 episode 维度显式化，避免不同 EP 混在一处）
- `AI/2026-02-14T12-34-56Z_ep010_variant_decide/`
  - `run.md`（面向人）
  - `run_context.md`（注入了什么）
  - `plan.json`（可执行计划）
  - `trace.json`（可选）

### 3.2 资产 Markdown 规范（Markdown-first + 最小结构化）
推荐使用 “Frontmatter + Body”：

```markdown
---
doc_type: asset
asset_type: character
asset_key: CHAR_001
name: 张三
aliases: [三哥, 阿三]
first_appearance_episode: 1
external_ids:
  your_system: "xxx"
---

# 张三（CHAR_001）

一句话：外表冷峻的青年侦探。

## Variants

### adult_default
- 指纹：黑短发、风衣、左眉疤
- 首次出现：EP001

### disguise_01
- 指纹：棕中长发（假发）、保安制服
- 首次出现：EP004
```

正文允许按来源追加块（用于审计与回放）：
```markdown
#### 来源：EP010 / character_expert@2
证据：……
差异：……
```

---

## 4. 上下文注入（Context Builder）整体方案

### 4.1 核心概念
- **Context Source**：上下文来源（VFS 目录/文件、DB 投影、外部系统等）
- **Context Policy**：注入策略（默认全量、按类型、按标签、按手选）
- **Context Bundle**：本次运行的“上下文快照”（Markdown 可读 + refs 可追溯）

### 4.2 分层配置（UI/后端都遵循）
1) **项目级默认**（Project Default）：默认全量注入（角色+道具+地点+特效）
2) **运行级覆盖**（Run Override）：可排除目录/手选资产/保存为模板
3) **本次快照**（Run Snapshot）：`run_context.md` 永久保存，可复现

### 4.3 注入数据形态（先不考虑 token）
默认“全量注入”并不意味着把所有文件原文拼接进 prompt；更合理的长期演进是：
- V1：全量原文注入（你当前先验证效果）
- V2：全量注入但在后端预先生成“资产卡片摘要”（Markdown），注入摘要而非全文
- V3：全文只在“候选资产点击展开”时拉取，prompt 只注入摘要 + refs

---

## 5. AI 工具链优化（围绕 ApplyPlan 与 Markdown）

### 5.1 Plan Normalize（让 preview_* 可落库）
目标：把 `tool_id=preview_*` 的计划归一化为执行端认识的 canonical plan。

建议：新增一个“归一化规则表”（纯数据/配置），把：
- `preview_script_split` → `episode_save`
- `preview_extract_character/prop/location/vfx` → `asset_create`
并保留来源字段：`source_tool_id/source_agent_code/source_version`。

这样场景测试就能一键落库（先归一化，再执行）。

### 5.2 资产提取输出改造（从 meta → Markdown）
目标：工具输出保持结构化外壳，但不稳定属性用 Markdown 承载。

建议新增 AssetDocV2（概念）：
- `type/name/keywords/first_appearance_episode`（最小字段）
- `details_md`（替代 meta）
- `provenance`（agent_code/version/model/input_refs）

落库：
- `asset_create` 执行写 `资产/.../*.md`（content_type=`text/markdown`）
- 同时可选写一份 `asset_index.json`（仅含最小字段，用于快速检索/粗筛）

### 5.3 变体判定工具（Match & Decide）
新增一个面向“第 N 集分析”的工具/agent 组合：
- 输入：
  - 当前集的候选角色描述（Markdown）
  - Context Bundle（注入资产库的 Markdown 或摘要卡片）
- 输出（结构化外壳 + Markdown 理由）：
  - `match_type`: new_asset / same_asset_new_variant / same_asset_same_variant
  - `asset_ref` / `variant_ref`
  - `confidence`
  - `reason_md` / `diff_md`
  - `ApplyPlan`：更新资产 Markdown（追加来源块/新增 variant 段）

---

## 6. UI 优化（围绕“全量注入 + 分层配置 + 可解释”）

### 6.1 默认体验（零配置）
- 运行面板固定展示 “上下文（Context）卡片”：
  - 默认：项目全量资产库
  - 显示注入范围与数量
  - 可展开查看注入清单与预览

### 6.2 高级设置（覆盖默认）
- 入口：运行面板的“高级设置”抽屉
- 能力：
  - 排除资产类型目录
  - 手动选择资产/文件夹
  - 保存为模板（运行配置）

### 6.3 可解释输出
- 运行结果区固定展示：
  - `run.md`（结论/建议/下一步）
  - `run_context.md`（注入了什么）
  - `plan.json`（可执行计划）

---

## 7. 分阶段落地路线（从不改核心数据到逐步替换 SSOT）

### Phase 1：不改 DB，仅增强“文档与计划”（最快验证）
- VFS 增加 `AI/` 运行归档目录
- 让场景测试也能输出 `run.md/run_context.md/plan.json`
- Plan Normalize：让 preview_* 生成的计划能落库（归一化后执行）

### Phase 2：资产 Markdown SSOT（替换 meta 的长期落点）
- `asset_create` 写入 Markdown 资产文档（可暂时双写 JSON + MD）
- 增加变体判定的 agent + ApplyPlan（仅更新 VFS 文档）

### Phase 3：DB 索引与指针补齐（让查询与引用稳定）
- 增加 `*_doc_node_id` 指针字段
- 从 VFS 文档投影出 DB 索引（异步任务/定时同步）
- 完成 “文档 SSOT / DB 投影” 的闭环

---

## 8. 实施任务拆分（面向工程落地）

### Task 1: 定义 VFS Markdown 文档契约与目录规范

**Files:**
- Modify: `docs/reports/2026-02-14-agent-内置工具输入说明.md`（追加“上下文注入/SSOT/Markdown 规范”链接）
- Create: `docs/plans/2026-02-14-ai-tools-ssot-context-optimization.md`（本文件）

**Step 1: 补齐资产/运行归档 Markdown 模板**
- 验证模板能被前端 markdown viewer 正常渲染（react-markdown/remark-gfm）

**Step 2: 定义最小结构化字段**
- 明确哪些字段必须结构化（用于关联/幂等），其余全部放 Markdown

### Task 2: 设计 Context Builder 的配置分层与运行快照

**Files:**
- Modify (future): `nextjs-frontend/app/(aistudio)/**`（增加 Context 卡片与高级设置抽屉）
- Modify (future): `fastapi_backend/app/ai_scene_test/deps.py`（增加 context bundle 字段）

**Step 1: 明确项目级配置与运行级覆盖的数据结构**
- 建议存入 DB 的 `project.settings` JSONB 或单独表（待定）

**Step 2: 定义 run_context.md 的内容规范**

### Task 3: 设计 Plan Normalize（preview_* → canonical）

**Files:**
- Modify (future): `fastapi_backend/app/api/v1/apply_plans.py`
- Modify (future): `fastapi_backend/app/ai_scene_test/tools.py`

**Step 1: 定义归一化映射表与 provenance 字段**
**Step 2: 执行端接受 canonical tool_id**

### Task 4: 资产 Markdown SSOT 与变体判定 agent（核心）

**Files:**
- Modify (future): `fastapi_backend/app/ai_tools/chatbox_tools.py`
- Modify (future): `fastapi_backend/app/vfs_docs.py`
- Modify (future): `fastapi_backend/app/api/v1/apply_plans.py`

**Step 1: 引入 AssetDocV2（details_md + provenance）**
**Step 2: asset_create 执行写 Markdown**
**Step 3: 新增 variant_decider 工具/agent，输出可执行计划 + Markdown 理由**

---

## 9. 验证标准（Definition of Done）

- 用户在 UI 上能看到：
  - 默认“项目全量资产注入”已启用
  - 注入清单可展开查看与预览
  - 运行结束后能看到 `run.md/run_context.md/plan.json`
- 场景测试产出的计划可在归一化后落库（不再卡在 `preview_*` tool_id）
- 资产不稳定属性不再依赖 JSON meta，改为 Markdown 说明书承载（至少支持双写过渡）

