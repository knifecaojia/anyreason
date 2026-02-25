# 实施计划：无限画布 × 分镜融合（Infinite Canvas Storyboard Fusion）

## 概述

基于 Studio 画布的 ReactFlow 基础设施进行渐进式增强，将分镜页面的节点类型和工作流能力合并迁移到 Studio 画布。实施顺序为：核心类型定义 → 基础模块 → 节点组件提取 → 高级功能 → 集成联调。所有代码使用 TypeScript，测试使用 Vitest + fast-check。

## 任务

- [x] 1. 核心类型定义与基础模块
  - [x] 1.1 创建 `lib/canvas/types.ts` 统一类型定义文件
    - 定义 PortDataType、PortDirection、PortDefinition 类型
    - 定义 BaseNodeData 及 10 种节点数据接口（TextNoteNodeData、MediaNodeData、AssetNodeData、ReferenceNodeData、ScriptNodeData、GeneratorNodeData、PreviewNodeData、SlicerNodeData、CandidateNodeData、StoryboardNodeData）
    - 定义 UnifiedNodeData 联合类型和 UnifiedNodeType 类型
    - 定义 WorkflowSnapshot、SerializedNode、SerializedEdge 接口
    - 定义 QueueItemStatus、QueueItem、BatchQueueState 接口
    - 定义 CanvasState（用于撤销/重做）和 PerformanceMode 类型
    - _需求: 1.1, 1.4, 1.5, 1.13, 7.1_

  - [x] 1.2 创建 `lib/canvas/node-registry.ts` 节点类型注册表
    - 实现 NodeTypeRegistration 接口（type、label、group、icon、component、defaultData、ports）
    - 实现 registerNodeType、getNodeType、getNodeTypesByGroup、getAllNodeTypes、buildReactFlowNodeTypes 函数
    - 注册全部 10 种节点类型，分为四组：创作组（textNoteNode、scriptNode、storyboardNode）、AI 生成组（generatorNode、slicerNode、candidateNode）、展示组（previewNode、mediaNode）、引用组（assetNode、referenceNode）
    - 每种节点类型定义 defaultData 工厂函数和端口定义
    - _需求: 1.1, 1.2_

  - [x] 1.3 编写节点注册表属性测试 `__tests__/canvas/node-registry.pbt.test.ts`
    - **Property 1: 节点注册表分组完整性** — 验证每种节点类型恰好属于四个分组之一，且分组映射与预定义一致
    - **验证需求: 1.2**
    - **Property 2: 节点创建正确性** — 验证通过节点工厂创建的节点实例具有正确的 type、position 和默认数据
    - **验证需求: 1.3, 4.2**
    - **Property 3: 剧本节点文本长度约束** — 验证 ≤10000 字符接受，>10000 字符拒绝
    - **验证需求: 1.4**
    - **Property 4: 节点折叠状态切换** — 验证单次切换取反、双次切换恢复原值；批量折叠设为统一目标值
    - **验证需求: 1.13, 5.5**

- [x] 2. 端口类型系统与数据流引擎
  - [x] 2.1 创建 `lib/canvas/port-system.ts` 端口类型系统
    - 实现 PORT_COLORS 颜色映射（text 蓝色、image 紫色、video 绿色、asset-ref 橙色、storyboard-list 青色）
    - 实现 arePortsCompatible 函数（严格类型匹配）
    - 实现 validateConnection 函数（类型兼容性检查 + 循环检测集成）
    - _需求: 2.1, 2.2, 2.3, 2.5, 2.9_

  - [x] 2.2 编写端口类型系统属性测试 `__tests__/canvas/port-system.pbt.test.ts`
    - **Property 5: 端口类型兼容性验证** — 验证 validateConnection 在 dataType 相同时返回 valid:true，不同时返回 valid:false
    - **验证需求: 2.2, 2.3, 2.5, 4.6**
    - **Property 8: 端口颜色映射唯一性** — 验证不同端口类型对应不同颜色值
    - **验证需求: 2.9**

  - [x] 2.3 创建 `lib/canvas/data-flow.ts` 数据流引擎
    - 实现 topologySort 函数（Kahn 算法拓扑排序 + 循环检测）
    - 实现 wouldCreateCycle 函数（BFS 检测单条边添加是否产生循环）
    - 实现 getDownstreamNodes 函数（BFS 获取所有下游节点）
    - 实现 propagateData 函数（沿连接传播数据到下游节点）
    - _需求: 2.4, 2.6, 3.1_

  - [x] 2.4 编写数据流引擎属性测试 `__tests__/canvas/data-flow.pbt.test.ts`
    - **Property 6: 数据沿 DAG 传播完整性** — 验证源节点输出变化时所有可达下游节点接收更新，不可达节点不受影响
    - **验证需求: 2.4**
    - **Property 7: 循环连接检测** — 验证 wouldCreateCycle 对会形成环的边返回 true，不会形成环的边返回 false
    - **验证需求: 2.6**
    - **Property 9: 拓扑排序有效性** — 验证排序结果中每条边 (u,v) 的 u 在 v 之前，且包含所有节点
    - **验证需求: 3.1**

- [x] 3. 检查点 — 核心模块验证
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 4. 批量队列与序列化模块
  - [x] 4.1 创建 `lib/canvas/batch-queue.ts` 批量队列管理器
    - 实现 BatchQueueManager 类：enqueue（按拓扑排序入队）、start、stopAll、cancelTask、getState、checkTimeouts
    - 集成 TaskProvider 的 subscribeTask 进行 WebSocket 实时进度订阅
    - 实现并发限制（默认 maxConcurrency=3）
    - 实现 300 秒超时检测逻辑
    - 实现选中节点过滤（仅将生成节点加入队列）
    - _需求: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 4.2 编写批量队列属性测试 `__tests__/canvas/batch-queue.pbt.test.ts`
    - **Property 10: 并发限制执行** — 验证任意时刻 running 状态任务数不超过 maxConcurrency
    - **验证需求: 3.2**
    - **Property 11: 任务事件驱动节点状态更新** — 验证 progress/succeeded/failed 事件正确更新节点状态
    - **验证需求: 3.4, 3.5, 3.6**
    - **Property 12: 停止全部取消排队任务** — 验证 stopAll 后 pending 变 canceled，已完成任务不变
    - **验证需求: 3.8**
    - **Property 13: 超时检测** — 验证运行超过 300 秒的任务被标记为 timeout，未超时的不受影响
    - **验证需求: 3.9**
    - **Property 14: 选中节点过滤执行** — 验证 enqueue 仅将选中的生成节点加入队列
    - **验证需求: 3.10**

  - [x] 4.3 创建 `lib/canvas/serializer.ts` 序列化器
    - 创建 `lib/canvas/schema.json` 工作流快照 JSON Schema
    - 实现 serializeCanvas 函数（扩展现有格式，包含折叠状态和端口类型信息）
    - 实现 deserializeCanvas 函数（含 Ajv JSON Schema 验证）
    - 实现 migrateSnapshot 函数（旧版本格式迁移）
    - 实现 exportToFile 函数（触发浏览器下载 JSON 文件）
    - 实现 exportSelectedNodes 函数（仅导出选中节点及其之间的连接）
    - 实现 importFromFile 函数（读取 JSON 文件并验证）
    - _需求: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.4 编写序列化器属性测试 `__tests__/canvas/serializer.pbt.test.ts`
    - **Property 20: 序列化往返一致性** — 验证 serialize → stringify → parse → deserialize 产生等价状态
    - **验证需求: 7.1, 7.2, 7.3, 7.6**
    - **Property 21: 序列化输出符合 Schema** — 验证 serializeCanvas 输出通过 JSON Schema 验证
    - **验证需求: 7.4, 6.7**
    - **Property 22: 非法输入被 Schema 拒绝** — 验证不符合 Schema 的 JSON 返回 success:false 和非空 errors
    - **验证需求: 7.5, 6.8**

  - [x] 4.5 编写导入导出属性测试 `__tests__/canvas/export-import.pbt.test.ts`
    - **Property 18: 选中节点导出** — 验证导出仅包含选中节点和双端都在选中集合中的边
    - **验证需求: 6.6**
    - **Property 19: 版本迁移数据保持** — 验证迁移后版本号更新且所有节点和边数据保留
    - **验证需求: 6.9**

- [x] 5. 撤销/重做与性能模式模块
  - [x] 5.1 创建 `lib/canvas/undo-redo.ts` 撤销/重做管理器
    - 实现 UndoRedoManager：push（自动裁剪到 50 步）、undo、redo、canUndo、canRedo
    - push 后清除 redo 栈
    - _需求: 5.6, 5.7_

  - [x] 5.2 编写撤销/重做属性测试 `__tests__/canvas/undo-redo.pbt.test.ts`
    - **Property 17: 撤销/重做往返与栈限制** — 验证 push→undo 恢复前一状态，undo→redo 恢复 undo 前状态；超过 50 次 push 栈不超过 50
    - **验证需求: 5.7**

  - [x] 5.3 创建 `lib/canvas/performance.ts` 性能模式管理
    - 实现 PerformanceModeManager：mode、setMode、suggestMode（>50 节点建议 normal）、isInViewport、getNodeRenderLevel
    - 渲染级别逻辑：高质量模式全部 full；普通模式视口内 full、视口外 simplified；极速模式视口内 full、视口外 placeholder；zoom<0.3 时视口外均为 placeholder
    - _需求: 5.1, 5.2, 5.3, 5.8_

  - [x] 5.4 编写性能模式属性测试 `__tests__/canvas/performance.pbt.test.ts`
    - **Property 16: 性能模式渲染级别** — 验证各模式下 getNodeRenderLevel 返回正确级别，suggestMode 在 >50 节点时返回 normal
    - **验证需求: 5.1, 5.2, 5.8**

- [x] 6. 检查点 — 所有核心模块完成
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 7. 节点组件提取与创建
  - [x] 7.1 创建 `components/canvas/nodes/NodeShell.tsx` 通用节点外壳
    - 从 studio/page.tsx 提取通用节点渲染逻辑（标题栏、折叠/展开、端口渲染）
    - 支持 collapsed 状态切换（折叠时仅显示标题栏和端口）
    - 支持双击标题编辑
    - 根据性能模式渲染级别切换 full/simplified/placeholder 渲染
    - _需求: 1.12, 1.13, 5.1_

  - [x] 7.2 提取 Studio 现有节点组件
    - 创建 `components/canvas/nodes/TextNoteNode.tsx` — 从 studio/page.tsx 提取文本笔记节点
    - 创建 `components/canvas/nodes/MediaNode.tsx` — 从 studio/page.tsx 提取媒体节点
    - 创建 `components/canvas/nodes/AssetNode.tsx` — 合并 studio 和 storyboard 两个页面的 assetNode 实现
    - 创建 `components/canvas/nodes/ReferenceNode.tsx` — 从 studio/page.tsx 提取引用节点
    - 所有节点使用 NodeShell 包裹，注册到 node-registry
    - _需求: 1.1, 1.8_

  - [x] 7.3 迁移分镜页面节点组件
    - 创建 `components/canvas/nodes/ScriptNode.tsx` — 从 storyboard/page.tsx 迁移剧本节点，支持 ≤10000 字符文本输入，提供 text 输出端口
    - 创建 `components/canvas/nodes/GeneratorNode.tsx` — 从 storyboard/page.tsx 迁移生成节点，显示模型名称、提示词、进度条、结果缩略图
    - 创建 `components/canvas/nodes/PreviewNode.tsx` — 从 storyboard/page.tsx 迁移预览节点，支持图片和视频两种媒体类型
    - 创建 `components/canvas/nodes/SlicerNode.tsx` — 从 storyboard/page.tsx 迁移拆分节点，接收 text 输入，输出 storyboard-list
    - 创建 `components/canvas/nodes/CandidateNode.tsx` — 从 storyboard/page.tsx 迁移提取节点，接收 text 输入
    - 所有节点使用 NodeShell 包裹，注册到 node-registry
    - _需求: 1.4, 1.6, 1.9, 1.10, 1.11_

  - [x] 7.4 创建 `components/canvas/nodes/StoryboardNode.tsx` 分镜节点（新建）
    - 显示镜头编号、场景描述、对白文本、画面参考缩略图
    - 提供 text 输出端口（out-desc）和 image 输入端口（in-image）、asset-ref 输入端口（in-asset）
    - 使用 NodeShell 包裹，注册到 node-registry
    - _需求: 1.5_

- [x] 8. UI 组件与 Hooks
  - [x] 8.1 创建 `components/canvas/NodeLibrary.tsx` 节点库面板
    - 替代 Studio 现有的 LeftFloatingMenu
    - 按四个分组展示所有节点类型（从 node-registry 读取）
    - 支持拖拽到画布创建节点（设置 dataTransfer 数据）
    - _需求: 1.2, 1.3_

  - [x] 8.2 创建 `components/canvas/CanvasToolbar.tsx` 画布工具栏
    - "全部执行"按钮 — 触发批量队列执行
    - "执行选中"按钮 — 仅执行选中的生成节点
    - "停止全部"按钮 — 取消所有排队任务
    - 队列进度显示（已完成/总数）
    - "导出工作流"/"导入工作流"按钮
    - "导出选中"按钮
    - 性能模式切换下拉
    - 布局模式切换（卡片视图/时间线视图）
    - _需求: 3.1, 3.3, 3.7, 3.8, 3.10, 4.8, 5.1, 6.5, 6.6, 6.7_

  - [x] 8.3 创建 `components/canvas/TypedEdge.tsx` 类型化连接线组件
    - 根据端口数据类型使用 PORT_COLORS 着色
    - 数据传输时显示流动动画效果
    - 支持选中高亮
    - _需求: 2.9, 2.10_

  - [x] 8.4 创建 `components/canvas/AlignmentGuides.tsx` 对齐参考线组件
    - 拖拽节点时显示与相邻节点的对齐参考线
    - 配合 ReactFlow 的 snapToGrid 使用
    - _需求: 5.9_

  - [x] 8.5 创建 Hooks
    - 创建 `hooks/useDataFlow.ts` — 封装 topologySort、wouldCreateCycle、propagateData，提供 onConnect 验证回调
    - 创建 `hooks/useBatchQueue.ts` — 封装 BatchQueueManager，集成 TaskProvider，提供 enqueue/start/stopAll/cancelTask 和队列状态
    - 创建 `hooks/useUndoRedo.ts` — 封装 UndoRedoManager，绑定 Ctrl+Z/Ctrl+Shift+Z 快捷键
    - 创建 `hooks/usePerformanceMode.ts` — 封装 PerformanceModeManager，提供 mode/setMode/getNodeRenderLevel
    - _需求: 2.4, 2.6, 3.1, 3.2, 5.1, 5.6, 5.7_

- [x] 9. 检查点 — 组件与 Hooks 完成
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 10. Studio 画布页面升级
  - [x] 10.1 升级 `app/(aistudio)/studio/page.tsx` — 节点系统集成
    - 替换内联节点组件为 buildReactFlowNodeTypes() 注册表
    - 替换 LeftFloatingMenu 为 NodeLibrary 组件
    - 集成 useDataFlow hook，替换原有 onConnect 为带类型验证和循环检测的版本
    - 集成 TypedEdge 作为自定义边类型
    - _需求: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.6_

  - [x] 10.2 升级 `app/(aistudio)/studio/page.tsx` — 批量执行集成
    - 集成 useBatchQueue hook
    - 添加 CanvasToolbar 组件
    - 生成节点通过 TaskProvider subscribeTask 接收实时进度
    - 任务成功后通过 propagateData 传播结果到下游节点
    - 实现右键上下文菜单（停止此任务）
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 10.3 升级 `app/(aistudio)/studio/page.tsx` — 持久化与序列化
    - 替换现有 serializeCanvas 为新版 serializer 模块
    - 保持 800ms 防抖自动保存 + VFS + localStorage 兜底链路
    - 集成导入/导出功能
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 7.1, 7.2_

  - [x] 10.4 升级 `app/(aistudio)/studio/page.tsx` — 交互增强
    - 集成 useUndoRedo hook
    - 集成 usePerformanceMode hook
    - 实现键盘快捷键：Ctrl+A 全选、Ctrl+C/V 复制粘贴、Delete 删除、Ctrl+Z/Ctrl+Shift+Z 撤销重做
    - 集成 AlignmentGuides 组件
    - 实现批量折叠/展开操作
    - _需求: 5.4, 5.5, 5.6, 5.7, 5.9_

- [x] 11. 分镜功能融合
  - [x] 11.1 实现分镜节点与剧本数据联动
    - 右侧面板镜头拖拽创建分镜节点（替代现有 referenceNode）
    - 分镜节点编辑同步回后端 Storyboard 数据模型
    - 资产节点连接到分镜节点时调用后端 API 创建 AssetBinding
    - _需求: 4.1, 4.2, 4.5, 4.6_

  - [x] 11.2 实现分镜自动创建与工作流生成
    - 拆分节点输出分镜列表时自动创建分镜节点（水平排列布局）
    - "一键生成工作流"功能：剧本节点 → 拆分节点 → 分镜节点组 → 生成节点组 → 预览节点组，自动连接
    - _需求: 4.3, 4.4_

  - [x] 11.3 编写分镜融合属性测试 `__tests__/canvas/storyboard-fusion.pbt.test.ts`
    - **Property 15: 分镜列表自动创建节点数量** — 验证 N 个分镜条目恰好产生 N 个分镜节点，数据一致
    - **验证需求: 4.3**

  - [x] 11.4 实现批量操作与布局模式
    - 选中多个分镜节点时显示"批量生成图像"/"批量生成视频"快捷按钮
    - 实现卡片视图和时间线视图两种布局模式切换
    - _需求: 4.7, 4.8_

- [x] 12. 最终检查点 — 全部功能集成验证
  - 确保所有测试通过，如有问题请向用户确认。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点任务确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界条件
- 所有 22 个正确性属性均已分配到对应的属性测试任务中
