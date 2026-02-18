# 剧本入口接入 AI Scene & UX 重构方案

> **文档状态：** Draft  
> **最后更新：** 2026-02-17  
> **维护人：** 研发（Trae IDE 协作）

这份方案的目标不是“再加一堆 AI 按钮”，而是把剧本创作入口做成一个**可引导、可预览、可选择落库、可去重、可复盘**的工作台：用户像跟一位“严谨的副导演”协作——对话先讲清楚会做什么；每一步有明确产物；产物能对照原始输出；落库可控且可撤回（至少可重跑不乱）。

---

## 1. 背景与目标

### 1.1 业务目标

- 在“剧本创作”入口中开放 AI Scene 能力（而不是把用户带去另一个页面）。
- 强制对话式引导：用户始终知道“当前用的是什么 Scene / Agent / Tools、正在做哪一步、下一步会产出什么”。
- 打通 AI Scene 工具调用的原始输出与结构化数据的映射，并将结构化结果“可选择落库/批量落库”。
- 在落库环节加入去重与健康检查，保证结构化后的剧本数据清晰、完整、健康。

### 1.2 非目标（暂不做）

- 不在本阶段引入 Docker Compose 作为主开发方式。
- 不在本阶段重写整个任务系统；优先复用现有 AI Scene + ApplyPlan 闭环。

---

## 2. 基础现状调研（代码与交互快照）

### 2.1 现有入口与页面结构

- 侧边栏入口：
  - 剧本清单：`/scripts?mode=list`
  - 剧本创作：`/scripts?mode=write`
- 实际实现集中在单文件：`nextjs-frontend/app/(aistudio)/scripts/page.tsx`，通过 query 参数 `mode` 与 `pane` 切换视图。

### 2.2 AI Scene 现有能力（可复用闭环）

AI Scene 体系已经具备端到端闭环：

- **运行对话（SSE）**：`POST /api/v1/ai/scenes/{scene_code}/chat/stream`  
- **运行对话（同步）**：`POST /api/v1/ai/scenes/{scene_code}/chat`（用于在浏览器侧流式不稳定时兜底拿到 plans/trace）  
- **工具调用**：Scene 配置决定可用工具白名单，工具执行会产生 `ApplyPlan`  
- **结构化载体**：`ApplyPlan { kind, tool_id, inputs, preview }`  
- **执行落库**：`POST /api/v1/apply-plans/execute`（目前一次执行一个 plan）

特别重要的是：资产提取类工具的 `preview` 已包含 `raw_output_text`，天然满足“原始输出对照”。

### 2.3 剧本入口交互痛点（快照结论）

在 `/scripts` 的 list / dashboard / assets / editor 快照里，主要问题集中在：

- **信息重复、视觉噪音高**：写模式下多个 pane 都重复展示“剧本摘要 + KPI 卡 + 导演清单”，用户找不到“此刻我该做什么”。  
- **主流程不够聚焦**：导演清单像说明书，操作入口散落在多个按钮/弹窗，缺少“下一步建议动作”。  
- **异步反馈不透明**：结构化、拆解、提取等是长任务，但用户无法清楚看到“当前在跑哪个 Agent、已产出什么、失败能否重试”。  
- **结果不可控落库**：产物多数是“跑完就落”，或者落在 VFS/DB 后再回头看；缺少“先预览、再选择、再落库”的闸门。  
- **去重不显式**：资产/标签/提示词等可能重复，但 UI 缺少显式提醒与策略选择。  

---

## 3. 总体设计：把 AI Scene 嵌入剧本工作台

### 3.1 推荐主线

在 `/scripts?mode=write` 中新增一个 `pane=ai`（AI 助手面板），它是“剧本创作入口的 AI 中枢”，承载：

- 选择/切换 AI Scene（按目的：分集、分场、分镜、资产、提示词等）
- 对话式引导（严格要求第一条 assistant 消息讲清楚流程）
- 工具调用 Trace 与 ApplyPlan 预览队列
- 选择落库/批量落库、去重提示、执行后刷新

### 3.2 信息架构（IA）

在 write 模式中保持三栏结构（可响应式降级）：

- **左栏：流程与导航**
  - 剧集树（Episode）
  - “导演清单/进度时间线”（可折叠）
  - AI 助手入口（高亮当前步骤建议）
- **中栏：主要工作区**
  - `pane=dashboard`：总览与关键入口（尽量轻）
  - `pane=editor`：剧本编辑（按剧集/全文）
  - `pane=assets`：故事板结果与资产树（VFS）
  - `pane=ai`：对话 + 结果预览 + 落库控制（核心新增）
- **右栏：产物与落库队列（可选）**
  - 当前运行状态（工具事件时间线）
  - ApplyPlan 队列（待执行/已执行/失败）
  - 去重与健康提示（红/黄/绿）

---

## 4. 对话式引入（必须遵守的交互规则）

### 4.1 Chat 顶部固定信息（不随滚动消失）

- 当前 AI Scene：名称、用途、一句话说明
- 可用工具：来自 Scene 的 `required_tools`（按步骤排序）
- 本次目标：例如“从 EP001 提取角色 → 预览 → 选择落库 → 刷新上下文”

### 4.2 第一条 assistant 消息模板（强制）

第一条消息必须包含：

1) 我将做什么（明确范围与输出类型）  
2) 我会调用哪些工具（列出 tool_id + 人类可读 label）  
3) 每一步会产出什么预览（角色卡/地点卡/镜头表等）  
4) 你如何选择落库（单选/多选/全选/只落库新增）  
5) 去重与健康策略（重复项如何提示与处理）  

实现方式：优先通过 Scene 的 system prompt 约束；前端也在 UI 层做“引导提示条”兜底。

---

## 5. “原始输出 ↔ 结构化结果 ↔ 落库映射”的统一表现：PlanCard

### 5.1 PlanCard 结构

对每个 ApplyPlan 展示三块（折叠/展开）：

- **原始输出（Raw）**：直接展示 `plan.preview.raw_output_text`（可复制、可下载）  
- **结构化预览（Structured）**：从 `plan.inputs` 渲染为可操作 UI  
  - 角色/道具/地点：Card 列表（可勾选）  
  - 分镜：表格/时间线（可勾选镜头或整场）  
  - 提示词：diff/版本对比（可选择覆盖/追加）  
- **落库映射（Mapping）**：明确说明“字段到哪里去”  

### 5.2 映射规则（现状 + 预期）

现状（已存在）：

- `episode_save`：写 VFS `/分集/`，并更新 `episodes.episode_doc_node_id`
- `storyboard_apply`：写 `storyboards` 表
- `image_prompt_upsert`：写 `image_prompts`（delete-then-insert）
- `video_prompt_upsert`：写 `video_prompts`（delete-then-insert）
- `asset_create`（preview_extract_*）：写 VFS `/资产/<type>/`（md+json）

预期（逐步增强）：

- 对“角色/道具/地点/特效”提供可选“落到 DB assets 表”的执行路径（需要后端新增 apply kind 或复用现有 extraction service 的 dry-run/apply 形态）。

---

## 6. 选择落库/批量落库：前端拆分 ApplyPlan（先快跑）

由于 `/apply-plans/execute` 当前一次只执行一个 plan：

- 对于“多条资产/多条提示词”等 plan：UI 允许用户勾选子项。
- 执行时将一个 plan 拆分为 N 个小 plan（每个 plan.inputs 只包含所选条目），逐个调用 execute。
- 每个小 plan 生成一个客户端幂等键（例如 `plan.id + selected_item_key`），防止重复点击导致重复写入。

> 这一步可以先不改后端，就能实现“选择落库/批量落库”的体验闭环。

---

## 7. 去重与“数据健康”策略

### 7.1 UI 层去重（即时反馈）

- 规范化 key：`type + normalize(name)`（去空格、统一大小写、去常见后缀）
- 重复检测：
  - 同名重复：强提醒（默认只勾选一条）
  - 疑似重复（关键词高度重叠）：弱提醒（建议合并/人工确认）
- 提供策略按钮：
  - “仅选择推荐保留”
  - “全选但标黄”

### 7.2 执行层幂等（短期）

- 对 execute 调用增加前端侧幂等防抖与重试策略（失败保留 plan，允许重试）。

### 7.3 DB/后端约束（中期，可能涉及迁移）

- `image_prompts` / `video_prompts`：若业务语义为“一镜头仅一份提示词”，建议加 `UNIQUE(storyboard_id)`，并将 delete-then-insert 改为 upsert。
- 资产去重键：服务层目前按 `project_id + type + lower(name)` 复用，但 DB 层仅约束 `asset_id`；建议补齐 canonical 字段或引入事务级 upsert。

---

## 8. UI 视觉与组件风格（遵循现有配色）

### 8.1 现有配色基底

来自 `globals.css`：

- primary：`--color-primary`（蓝）
- accent：`--color-accent`（青）
- surface / surfaceHighlight：浅灰层级
- dark mode：已配置对应变量

### 8.2 风格建议

- 风格：**现代极简 + 轻 bento grid**（减少噪音、突出主流程与主按钮）
- 交互：进度时间线 + 粘性右侧落库队列（长任务场景更稳）
- 组件：优先复用 `components/ui`（shadcn 风格），补齐缺失组件时保持同一套 token 与 radius。

---

## 9. 实施步骤（按阶段交付）

### Phase A：文档与对齐（本文件 + 补充草图）

- 输出 IA、关键组件、数据流与落库映射表
- 输出失败/重试/撤销策略

### Phase B：前端重构与新增 AI pane

- 拆分 `scripts/page.tsx`，把 list/write/pane 拆成可维护的组件层级
- 新增 `pane=ai`：内嵌 Scene Runner、Trace、PlanCard、落库队列

### Phase C：去重与健康检查

- UI 去重提示与选择策略
- 执行幂等与重试策略

### Phase D（可选）：后端约束与更强幂等

- prompts 唯一约束与 upsert
- 资产 canonical 去重与更强事务

---

## 10. 验证用例（端到端）

用 1-2 份真实剧本完成以下闭环：

1) 创建剧本 → 自动分集（episode_save / structure）  
2) 在 AI pane 对 EP001 “提取角色” → 展示 raw/structured → 选 3 个落库  
3) 刷新上下文（右上角上下文统计应变化，且重复提示合理）  
4) 对一个分场跑分镜（storyboard_apply）→ DB `storyboards` 变化符合预期  
5) 为镜头生成提示词（image/video_prompt_upsert）→ DB 行数与幂等符合预期  

验收标准：用户能在 UI 中理解每一步、可控落库、可复跑不乱、数据结构清晰且无明显重复污染。
