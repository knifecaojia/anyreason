# 需求文档：无限画布 × 分镜融合（Infinite Canvas Storyboard Fusion）

## 简介

本特性将参考项目 Tapnow Studio 的节点式工作流思路，与 AnyReason（言之有理）现有的剧本结构化创作体系深度融合。目标是在创作工坊（Studio）已有的 ReactFlow 画布基础上，将其升级为功能完备的可视化 AI 创作引擎：合并分镜页面的节点类型与工作流能力到 Studio 画布，扩展连接协议，集成 TaskProvider 的 WebSocket 实时进度推送，并增强持久化与导入导出能力。

本需求文档基于对现有代码库的深入分析编写，每项需求均标注与现有功能的关系：
- 🟢 **已有** — 功能已存在，仅需少量调整
- 🟡 **增强** — 功能已有基础，需要显著扩展
- 🔴 **新建** — 全新功能

## 术语表

- **画布（Canvas）**：基于 @xyflow/react 的无限缩放拖拽工作区，承载所有创作节点（Studio 页面已实现基础版本）
- **节点（Node）**：画布上的可视化功能单元，每种节点有独立的输入/输出端口和状态显示
- **连接（Edge）**：节点之间的有向数据流连线，定义数据传递关系
- **端口（Handle）**：节点上的输入/输出连接点，具有类型约束（分镜页面已实现 in-script、in-ref、text、ref、image 五种类型）
- **工作流（Workflow）**：由节点和连接组成的有向图，描述完整的创作流程（分镜页面已实现 STORYBOARD 和 EXTRACTION 两种模板）
- **批量队列（Batch_Queue）**：管理画布上多个生成任务的并发执行队列
- **节点库（Node_Library）**：可拖拽到画布的节点类型面板（分镜页面已实现侧边栏节点库）
- **性能模式（Performance_Mode）**：控制画布渲染精度以适应不同规模节点图的模式
- **工作流快照（Workflow_Snapshot）**：工作流的完整序列化状态，用于持久化和导入导出（Studio 已有 serializeCanvas() 产出 {version, canvasId, reactflow, updatedAt} 格式）
- **剧本节点（Script_Node）**：承载剧本文本内容的节点，可连接到下游分析节点（分镜页面已有 scriptNode 类型）
- **分镜节点（Storyboard_Node）**：表示单个镜头的节点，包含镜头描述、对白、画面参考
- **生成节点（Generator_Node）**：调用 AI 网关进行图像或视频生成的节点（分镜页面已有 generatorNode 类型）
- **资产节点（Asset_Node）**：引用项目资产库中资产的节点，提供角色/场景/道具参考（Studio 和分镜页面均已有 assetNode 类型）
- **预览节点（Preview_Node）**：展示生成结果的节点，支持图片和视频预览（分镜页面已有 previewNode 类型）
- **拆分节点（Splitter_Node）**：调用 LLM 将剧本文本拆分为分镜列表的节点（分镜页面已有 slicerNode 类型）
- **提取节点（Extractor_Node）**：调用 AI 从剧本中提取角色/场景/道具/特效的节点（分镜页面已有 candidateNode 类型配合 extraction 工作流）
- **AI_Gateway**：后端 AI 网关服务，统一封装文本/图像/视频生成调用（已有 /api/ai/image/generate 等端点）
- **Task_System**：后端基于 Redis 的异步任务系统，支持 WebSocket 实时进度推送（TaskProvider 已实现 WebSocket 连接和 subscribeTask）
- **VFS**：虚拟文件系统，用于画布数据的持久化存储（Studio 已使用 VFS 保存画布到"创作工坊/画布/"路径）

## 现有基础设施

本特性建立在以下已有代码基础之上，而非从零开始构建：

### Studio 页面（创作工坊）— `app/(aistudio)/studio/page.tsx`

已实现的功能：
- ReactFlow 画布：`useNodesState`、`useEdgesState`、`onConnect`、`onDrop`、`onDragOver`
- 4 种节点类型：`textNoteNode`（文本笔记）、`mediaNode`（媒体）、`assetNode`（资产）、`referenceNode`（引用）
- 右侧面板 3 个标签页：故事板（storyboard）、资产（assets）、检查器（inspector）
- VFS 持久化：`saveToVfs()` + `ensureCanvasFolder()` 创建"创作工坊/画布/"目录结构
- localStorage 兜底：VFS 失败时自动降级
- 800ms 防抖自动保存：`useEffect` + `setTimeout`
- 画布序列化：`serializeCanvas()` 产出 `{version, canvasId, reactflow: {nodes, edges, viewport}, updatedAt}`
- 剧本/分集选择下拉框：从 `/api/scripts` 和 `/api/scripts/{id}/hierarchy` 加载
- 右侧面板拖拽：故事板镜头 → referenceNode，资产 → assetNode
- `LlmPromptPanel` 叠加层：媒体节点在缩放 > 0.6 时显示
- `LeftFloatingMenu`：addTextNote 和 addMediaNode 按钮
- 保存状态显示："保存中…"、"已保存"、"保存失败（已本地兜底）"

### 分镜页面 — `app/(aistudio)/storyboard/page.tsx`

已实现的功能（需迁移到 Studio 画布）：
- ReactFlow 画布：6 种节点类型 `assetNode`、`scriptNode`、`generatorNode`、`previewNode`、`slicerNode`、`candidateNode`
- 节点库侧边栏：拖拽创建 Script、Generator、Preview、Asset 节点
- 两种工作流模板：STORYBOARD 和 EXTRACTION
- `runWorkflow()` 函数：按顺序执行所有 generatorNode
  - extraction 生成器：模拟提取并传递结果到 candidateNode
  - image 生成器：调用 `/api/ai/image/generate`，传入 prompt、negPrompt、resolution
  - 沿 edge 传播结果到下游 previewNode/slicerNode
- 节点属性编辑面板（右侧边栏）
- 类型化端口：`in-script`、`in-ref`、`text`、`ref`、`image`，连接线按类型着色

### TaskProvider — `components/tasks/TaskProvider.tsx`

已实现的功能（需集成到画布生成流程）：
- WebSocket 连接 `/ws/tasks`，基于 ticket 认证
- `subscribeTask(taskId, handler)` 按任务订阅事件
- `refreshTasks()` 轮询任务列表
- `upsertTask()` 更新任务状态
- 自动重连（1 秒延迟）
- 事件类型：created、running、progress、succeeded、failed、canceled、retried

### 后端基础设施

- 17 种异步任务类型（Redis 队列）
- AI Gateway：文本/图像/视频生成端点
- VFS API：文件持久化

### 不采用的组件

- `components/aistudio/InfiniteCanvas.tsx`：自定义画布实现（非 ReactFlow），为旧版/备选方案，不作为本特性基础


## 需求

### 需求 1：统一节点类型体系 🟡 增强

**现有基础：** Studio 已有 4 种节点类型（textNoteNode、mediaNode、assetNode、referenceNode），分镜页面已有 6 种节点类型（scriptNode、generatorNode、previewNode、slicerNode、candidateNode、assetNode）。两套节点类型体系独立存在，assetNode 在两个页面中均有实现。本需求的核心任务是将分镜页面的节点类型合并迁移到 Studio 画布，形成统一的节点类型注册表。

**用户故事：** 作为创作者，我希望画布上有统一的节点类型覆盖 AI 创作全流程，以便在一个画布上完成从剧本到成片的所有操作，不再需要切换到独立的分镜页面。

#### 验收标准

1. 🟡 THE 画布 SHALL 维护一个统一的节点类型注册表，合并 Studio 现有的 4 种节点类型（textNoteNode、mediaNode、assetNode、referenceNode）和分镜页面的 6 种节点类型（scriptNode、generatorNode、previewNode、slicerNode、candidateNode、assetNode），去重后形成完整的节点类型集合
2. 🟡 THE 节点库 SHALL 以分组形式展示所有可用节点类型：创作组（文本笔记节点、剧本节点、分镜节点）、AI 生成组（生成节点、拆分节点、提取节点）、展示组（预览节点、媒体节点）、引用组（资产节点、引用节点），替代 Studio 现有的 LeftFloatingMenu 中仅有 addTextNote 和 addMediaNode 两个按钮的方式
3. 🟢 WHEN 用户从节点库拖拽一个节点类型到画布空白区域时，THE 画布 SHALL 在鼠标释放位置创建该类型的新节点实例（Studio 和分镜页面均已实现 onDrop/onDragOver 模式，需统一拖拽协议）
4. 🟡 THE 剧本节点 SHALL 复用分镜页面 scriptNode 的实现，支持输入最多 10000 个字符的剧本文本，并提供一个文本类型的输出端口
5. 🔴 THE 分镜节点 SHALL 显示镜头编号、场景描述、对白文本和画面参考缩略图，并提供文本输出端口和图像输入端口（Studio 现有的 referenceNode 仅显示镜头引用，需升级为完整的分镜编辑节点）
6. 🟡 THE 生成节点 SHALL 复用分镜页面 generatorNode 的实现，显示当前选择的 AI 模型名称、提示词输入区域、生成进度条和结果缩略图预览
7. 🟢 WHEN 用户选中一个生成节点时，THE 画布 SHALL 在右侧检查器（inspector）标签页中显示模型选择器、提示词编辑器、负向提示词编辑器和分辨率/宽高比选项（分镜页面已有节点属性编辑面板，Studio 已有 inspector 标签页，需对接）
8. 🟢 THE 资产节点 SHALL 统一 Studio 和分镜页面两个版本的 assetNode 实现，显示资产名称、类型标签和缩略图，并从当前项目的资产库中加载数据
9. 🟡 THE 预览节点 SHALL 复用分镜页面 previewNode 的实现，支持显示图片和视频两种媒体类型，并根据输入数据自动切换显示模式
10. 🟡 THE 拆分节点 SHALL 复用分镜页面 slicerNode 的实现，接收文本输入端口的数据，调用 AI_Gateway 的 LLM 能力将文本拆分为分镜列表，并为每个分镜创建输出端口
11. 🟡 THE 提取节点 SHALL 复用分镜页面 candidateNode 的提取逻辑，接收文本输入端口的数据，调用 AI_Gateway 提取角色、场景、道具或特效信息，并通过输出端口传递提取结果
12. 🟢 WHEN 用户双击一个节点的标题区域时，THE 画布 SHALL 允许用户编辑该节点的标题文本（ReactFlow 节点自定义渲染已支持此交互模式）
13. 🔴 THE 每个节点 SHALL 支持折叠和展开两种显示状态，折叠状态仅显示标题栏和端口

### 需求 2：节点连接协议与数据流 🟡 增强

**现有基础：** 分镜页面已实现类型化端口系统（in-script、in-ref、text、ref、image）和按类型着色的连接线。Studio 页面使用 ReactFlow 的基础 onConnect 建立连接，但无类型约束。本需求的核心任务是将分镜页面的类型化端口协议迁移到 Studio，并扩展数据类型集合和数据传播机制。

**用户故事：** 作为创作者，我希望通过连线在节点之间建立类型安全的数据流，以便自动化地将剧本文本传递到 AI 拆分、再到图像生成、最终到预览的完整流程。

#### 验收标准

1. 🟡 THE 画布 SHALL 扩展分镜页面现有的端口类型系统（in-script、in-ref、text、ref、image），定义以下统一端口数据类型：文本（text）、图像（image）、视频（video）、资产引用（asset-ref）、分镜列表（storyboard-list）
2. 🟡 WHEN 用户从一个节点的输出端口拖拽连线到另一个节点的输入端口时，THE 画布 SHALL 复用分镜页面的类型匹配逻辑，仅在两个端口的数据类型兼容时允许建立连接
3. 🔴 IF 用户尝试连接两个数据类型不兼容的端口，THEN THE 画布 SHALL 显示视觉反馈（端口变红）并拒绝建立连接（分镜页面当前无不兼容视觉反馈）
4. 🔴 WHEN 一个上游节点的输出数据发生变化时，THE 画布 SHALL 沿连接路径将新数据传播到所有下游节点（分镜页面的 runWorkflow 仅在执行时传播，需改为实时传播）
5. 🟢 THE 画布 SHALL 支持一个输出端口连接到多个输入端口（一对多扇出）（ReactFlow 默认支持）
6. 🔴 THE 画布 SHALL 禁止形成循环连接，WHEN 用户尝试建立会导致循环的连接时，THE 画布 SHALL 拒绝该操作
7. 🟢 WHEN 用户选中一条连接线时，THE 画布 SHALL 高亮显示该连接线及其两端的端口（ReactFlow 内置选中高亮）
8. 🟢 WHEN 用户按下 Delete 键且有连接线被选中时，THE 画布 SHALL 删除该连接线并停止相关数据传播（ReactFlow 内置删除支持）
9. 🟡 THE 连接线 SHALL 根据传输的数据类型使用不同颜色：文本为蓝色、图像为紫色、视频为绿色、资产引用为橙色、分镜列表为青色（分镜页面已有按类型着色，需扩展颜色映射）
10. 🔴 WHEN 数据正在通过连接线传输时，THE 连接线 SHALL 显示流动动画效果


### 需求 3：画布上的批量生成与队列管理 🟡 增强

**现有基础：** 分镜页面的 `runWorkflow()` 已实现按顺序执行所有 generatorNode 的逻辑，包括调用 `/api/ai/image/generate` 和沿 edge 传播结果。TaskProvider 已实现 WebSocket 连接 `/ws/tasks`、`subscribeTask(taskId, handler)` 按任务订阅事件、自动重连等能力。本需求的核心任务是将分镜页面的顺序执行升级为基于 TaskProvider WebSocket 的并发队列管理，实现实时进度推送而非顺序 await。

**用户故事：** 作为创作者，我希望在画布上一次性触发多个生成节点的批量执行，并通过实时进度反馈了解每个任务的状态，以便高效地批量生成分镜图像或视频。

#### 验收标准

1. 🟡 WHEN 用户点击画布工具栏的"全部执行"按钮时，THE 批量队列 SHALL 收集画布上所有待执行的生成节点，按拓扑排序确定执行顺序，并通过 Task_System 提交异步任务（替代分镜页面 runWorkflow 的顺序 await 模式）
2. 🔴 THE 批量队列 SHALL 支持配置最大并发数（默认为 3），同一时刻最多有配置数量的生成任务并行执行
3. 🔴 WHILE 批量队列正在执行时，THE 画布 SHALL 在工具栏显示队列进度（已完成/总数）和预计剩余时间
4. 🟡 WHEN 一个生成节点的任务提交到 Task_System 后，THE 生成节点 SHALL 通过 TaskProvider 的 `subscribeTask(taskId, handler)` 接收 WebSocket 实时进度事件（progress、succeeded、failed），并在节点上显示进度百分比（替代分镜页面的同步等待模式）
5. 🟡 WHEN 一个生成节点的任务成功完成时，THE 生成节点 SHALL 更新结果缩略图并将生成结果通过输出端口传播到下游节点（复用分镜页面沿 edge 传播结果的逻辑）
6. 🟢 IF 一个生成节点的任务执行失败，THEN THE 生成节点 SHALL 在节点上显示错误状态标识和错误摘要信息（TaskProvider 已支持 failed 事件类型）
7. 🔴 WHEN 用户右键点击一个正在执行的生成节点时，THE 画布 SHALL 提供"停止此任务"的上下文菜单选项
8. 🔴 WHEN 用户点击画布工具栏的"停止全部"按钮时，THE 批量队列 SHALL 取消所有尚未开始的排队任务，并向 Task_System 发送取消请求（TaskProvider 已支持 canceled 事件类型）
9. 🔴 IF 一个生成任务在 300 秒内未返回结果，THEN THE 批量队列 SHALL 将该任务标记为超时并自动跳过，继续执行队列中的下一个任务
10. 🔴 WHEN 用户框选多个生成节点并点击"执行选中"时，THE 批量队列 SHALL 仅将选中的生成节点加入执行队列

### 需求 4：分镜功能画布化融合 🟡 增强

**现有基础：** Studio 已有剧本/分集选择下拉框（从 `/api/scripts` 和 `/api/scripts/{id}/hierarchy` 加载）、右侧面板故事板标签页展示镜头列表、镜头拖拽到画布创建 referenceNode 的功能。分镜页面已有完整的工作流模板（STORYBOARD、EXTRACTION）和 runWorkflow 执行逻辑。本需求的核心任务是将分镜页面的工作流创建和执行能力迁移到 Studio 画布，与 Studio 已有的剧本选择和镜头拖拽功能融合。

**用户故事：** 作为创作者，我希望在创作工坊画布中直接完成分镜创作的全部工作，以便不再需要在独立的分镜页面和画布之间来回切换。

#### 验收标准

1. 🟢 WHEN 用户在右侧面板选择一个剧本和分集时，THE 画布 SHALL 加载该分集下的所有镜头数据，并在右侧面板的故事板标签页中以列表形式展示（Studio 已实现此功能，保持现有行为）
2. 🟡 WHEN 用户将右侧面板中的镜头条目拖拽到画布时，THE 画布 SHALL 创建一个分镜节点（替代现有的 referenceNode），自动填充该镜头的编号、描述和对白数据
3. 🔴 WHEN 用户在画布上通过拆分节点生成新的分镜列表时，THE 画布 SHALL 为列表中的每个分镜自动创建分镜节点，并按水平排列布局
4. 🔴 THE 画布 SHALL 提供"一键生成工作流"功能（迁移自分镜页面的工作流模板概念）：WHEN 用户选择一个分集并点击"生成工作流"按钮时，THE 画布 SHALL 自动创建剧本节点 → 拆分节点 → 分镜节点组 → 生成节点组 → 预览节点组的完整工作流，并自动连接所有节点
5. 🔴 WHEN 用户在画布上编辑分镜节点的描述或对白时，THE 画布 SHALL 将修改同步回后端的 Storyboard 数据模型
6. 🔴 THE 画布 SHALL 支持将资产节点连接到分镜节点的资产引用输入端口，WHEN 连接建立时，THE 画布 SHALL 调用后端 API 创建对应的 AssetBinding 记录
7. 🔴 WHEN 用户在画布上选中多个分镜节点时，THE 画布 SHALL 在工具栏提供"批量生成图像"和"批量生成视频"快捷按钮
8. 🔴 THE 画布 SHALL 支持分镜节点的卡片视图和时间线视图两种布局模式，用户可通过工具栏按钮切换

### 需求 5：画布交互与性能优化 🟡 增强

**现有基础：** Studio 画布已使用 ReactFlow 内置功能：Controls 组件、fitView、snapToGrid={true}、minZoom={0.1}。LlmPromptPanel 已根据缩放级别（zoom > 0.6）控制显示。Studio 已有框选和多选节点的基础支持（ReactFlow 默认行为）。本需求的核心任务是在 ReactFlow 已有能力基础上增加性能分级渲染、撤销/重做、对齐辅助等高级交互功能。

**用户故事：** 作为创作者，我希望在包含大量节点的画布上依然能流畅操作，以便处理复杂的长篇剧本创作项目。

#### 验收标准

1. 🔴 THE 画布 SHALL 支持三种性能模式：高质量模式（所有节点完整渲染）、普通模式（视口外节点简化渲染）、极速模式（视口外节点仅渲染占位框）
2. 🔴 WHEN 画布上的节点数量超过 50 个时，THE 画布 SHALL 自动建议用户切换到普通模式
3. 🟡 WHILE 用户正在缩放或平移画布时，THE 画布 SHALL 暂时降低非视口内节点的渲染精度，待操作停止 200 毫秒后恢复正常渲染（Studio 已有基于 zoom 级别的 LlmPromptPanel 显示控制逻辑，需扩展为通用的渲染精度控制）
4. 🟢 THE 画布 SHALL 支持框选操作：WHEN 用户在画布空白区域按住鼠标拖拽时，THE 画布 SHALL 显示选择框并选中框内的所有节点（ReactFlow 内置 selectionOnDrag 已支持）
5. 🟡 WHEN 用户选中多个节点时，THE 画布 SHALL 支持批量移动、批量删除和批量折叠/展开操作（ReactFlow 已支持批量移动和删除，需新增批量折叠/展开）
6. 🔴 THE 画布 SHALL 支持键盘快捷键：Ctrl+A 全选、Ctrl+C 复制选中节点、Ctrl+V 粘贴节点、Delete 删除选中项、Ctrl+Z 撤销、Ctrl+Shift+Z 重做
7. 🔴 THE 画布 SHALL 维护一个撤销/重做历史栈，最多保存 50 步操作记录
8. 🟡 WHEN 画布缩放级别低于 0.3 时，THE 画布 SHALL 切换到小地图模式，仅显示节点的色块占位和连接线概览（Studio 已有基于 zoom 级别的渲染切换逻辑，需扩展阈值和渲染策略）
9. 🔴 THE 画布 SHALL 提供对齐辅助功能：WHEN 用户拖拽节点时，THE 画布 SHALL 显示与相邻节点的对齐参考线（ReactFlow snapToGrid 已启用，需增加动态对齐参考线）


### 需求 6：工作流持久化与导入导出 🟡 增强

**现有基础：** Studio 已实现完整的持久化链路：800ms 防抖自动保存 → `saveToVfs()` 写入 VFS"创作工坊/画布/"路径 → localStorage 兜底 → 保存状态显示（"保存中…"、"已保存"、"保存失败（已本地兜底）"）。`serializeCanvas()` 已产出 `{version, canvasId, reactflow: {nodes, edges, viewport}, updatedAt}` 格式的快照。本需求的核心任务是在现有持久化基础上增加导入/导出功能和版本迁移机制。

**用户故事：** 作为创作者，我希望画布上的工作流能继续自动保存，并新增导入导出功能，以便在不同项目间复用工作流模板或与团队成员共享。

#### 验收标准

1. 🟢 THE 画布 SHALL 在节点、连接或视口发生变化后 800 毫秒内自动触发保存操作，将工作流快照写入 VFS（Studio 已实现，保持现有 800ms 防抖 + saveToVfs 行为）
2. 🟢 IF VFS 保存失败，THEN THE 画布 SHALL 将工作流快照写入浏览器 localStorage 作为兜底，并在界面显示"保存失败（已本地兜底）"提示（Studio 已实现，保持现有行为）
3. 🟢 WHEN 用户打开一个已有画布时，THE 画布 SHALL 优先从 VFS 加载工作流快照，若 VFS 无数据则尝试从 localStorage 恢复（Studio 已实现，保持现有行为）
4. 🟡 THE 工作流快照 SHALL 扩展现有的 serializeCanvas 输出格式，包含以下数据：版本号、画布 ID、所有节点（类型、位置、数据、折叠状态）、所有连接（含端口类型信息）、视口状态（位置和缩放级别）、更新时间戳（现有格式已包含 version、canvasId、reactflow、updatedAt，需扩展节点折叠状态和端口类型信息）
5. 🔴 WHEN 用户点击"导出工作流"按钮时，THE 画布 SHALL 将当前工作流快照序列化为 JSON 文件并触发浏览器下载
6. 🔴 WHEN 用户选中部分节点并点击"导出选中"时，THE 画布 SHALL 仅导出选中的节点及其之间的连接
7. 🔴 WHEN 用户点击"导入工作流"并选择一个 JSON 文件时，THE 画布 SHALL 验证文件格式，解析节点和连接数据，并将导入的节点添加到画布当前视口中心位置
8. 🔴 IF 导入的工作流 JSON 文件格式不合法或版本不兼容，THEN THE 画布 SHALL 显示具体的错误信息并拒绝导入
9. 🟡 THE 工作流快照 SHALL 使用递增的版本号标识格式（现有 serializeCanvas 已包含 version 字段），THE 画布 SHALL 支持从旧版本格式迁移到当前版本格式

### 需求 7：节点状态序列化与反序列化 🟡 增强

**现有基础：** Studio 的 `serializeCanvas()` 已将 ReactFlow 的 nodes、edges、viewport 序列化为 JSON 快照，包含 version 字段用于版本标识。现有序列化覆盖了节点位置和基础数据，但未包含新增节点类型的完整内部状态（如生成结果 URL、进度状态等）。本需求的核心任务是扩展序列化范围以覆盖所有新节点类型的完整状态，并增加 JSON Schema 验证和往返一致性保证。

**用户故事：** 作为创作者，我希望画布保存和恢复时所有节点的内部状态都能完整保留，以便重新打开画布后继续之前的工作。

#### 验收标准

1. 🟡 THE 画布 SHALL 扩展现有的 serializeCanvas 逻辑，将每个节点的完整数据（包括用户输入的文本、选择的模型配置、生成结果 URL、进度状态）序列化到工作流快照中（现有实现已序列化 ReactFlow nodes 的 data 字段，需确保新节点类型的 data 结构完整）
2. 🟡 WHEN 画布从工作流快照恢复时，THE 画布 SHALL 将每个节点的数据反序列化并恢复到保存时的状态（现有实现已从快照恢复 nodes/edges/viewport，需确保新节点类型的状态完整恢复）
3. 🔴 FOR ALL 合法的工作流快照，序列化后再反序列化 SHALL 产生与原始状态等价的工作流（往返一致性）
4. 🔴 THE 画布 SHALL 为工作流快照定义 JSON Schema，THE 序列化器 SHALL 按照该 Schema 生成输出
5. 🔴 THE 反序列化器 SHALL 按照 JSON Schema 验证输入，IF 输入不符合 Schema，THEN THE 反序列化器 SHALL 返回描述性错误信息
6. 🟡 THE 画布 SHALL 提供格式化器将工作流快照对象格式化为合法的 JSON 字符串（现有 serializeCanvas 已使用 JSON.stringify，需确保新增字段的格式化兼容性）
