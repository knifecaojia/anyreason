# 创作工坊无限画布：视频节点自适应宽高比 + Undo/Redo 工具栏 + 连线删除清理

> **文档状态：** Completed
> **创建日期：** 2026-03-25
> **维护人：** 研发

---

## 1. 需求概述

1. **视频节点自适应宽高比**：视频生成完成后，节点应根据视频实际尺寸自适应调整宽高比
2. **顶部菜单 Undo/Redo 图标**：在顶部工具栏添加 Undo/Redo 图标按钮，支持 `Ctrl+Z` 和 `Ctrl+Y` 快捷键
3. **删除连线清理同步数据**：删除节点连接时，清理目标节点通过该连接同步的文本提示词、参考图片等数据

---

## 2. 技术方案

### 2.1 视频节点自适应宽高比

**现状分析**：
- `VideoOutputNode` 组件当前使用固定的节点尺寸（默认 400x225，16:9 比例）
- 视频生成完成后，使用 `<video>` 标签展示，但容器尺寸固定
- 用户期望：节点能根据视频实际宽高比自动调整

**实现方案**：
1. 在视频加载完成时（`onLoadedMetadata` 事件）获取视频的 `videoWidth` 和 `videoHeight`
2. 计算实际宽高比，更新节点尺寸
3. 保持节点宽度不变，根据宽高比调整高度
4. 存储视频实际宽高比到 `data.actualAspectRatio` 字段

**修改文件**：
- `nextjs-frontend/components/canvas/nodes/VideoOutputNode.tsx`

**关键代码逻辑**：
```typescript
// 视频加载后获取实际尺寸
const handleVideoLoad = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
  const video = e.currentTarget;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width && height) {
    // 计算实际宽高比
    const actualRatio = `${width}:${height}`;
    // 更新节点尺寸：保持宽度，调整高度
    const currentWidth = props.width || 400;
    const newHeight = Math.round(currentWidth * (height / width));
    // 通过 ReactFlow 的 updateNodeData 更新
    updateNodeData(props.id, {
      ...data,
      actualAspectRatio: actualRatio,
      videoWidth: width,
      videoHeight: height,
    });
  }
}, [props.id, props.width, data, updateNodeData]);
```

### 2.2 顶部菜单 Undo/Redo 图标

**现状分析**：
- `useUndoRedo` hook 已实现 undo/redo 功能
- 快捷键支持：`Ctrl+Z`（undo）和 `Ctrl+Shift+Z`（redo）
- `CanvasToolbar` 组件位于画布顶部中央，但只有保存、导入、导出按钮
- 缺少可视化的 undo/redo 按钮和 `Ctrl+Y` 快捷键

**实现方案**：
1. 修改 `CanvasToolbar` 接口，增加 `onUndo`、`onRedo`、`canUndo`、`canRedo` 属性
2. 在工具栏添加 Undo（撤销）/ Redo（重做）图标按钮
3. 修改 `useUndoRedo` hook，增加 `Ctrl+Y` 快捷键支持
4. 在 `page.tsx` 中传递 undo/redo 相关属性给 `CanvasToolbar`

**修改文件**：
- `nextjs-frontend/components/canvas/CanvasToolbar.tsx`
- `nextjs-frontend/hooks/useUndoRedo.ts`
- `nextjs-frontend/app/(studio)/studio/[canvasId]/page.tsx`

**UI 设计**：
```
┌─────────────────────────────────────────────────────────┐
│  [↩️] [↪️]  │  [💾 保存]  │  [📤 导入]  [📥 导出]      │
└─────────────────────────────────────────────────────────┘
```

**图标选择**：
- Undo: `Undo2` (lucide-react) 或 `ArrowLeft`
- Redo: `Redo2` (lucide-react) 或 `ArrowRight`

### 2.3 删除连线清理同步数据

**现状分析**：
- 当前删除连线时（`onEdgeDoubleClick` 或 `onEdgeClick`），只处理了 `assetNode` → `storyboardNode` 的 AssetBinding 清理
- 对于 ImageOutputNode 和 VideoOutputNode，上游数据（提示词、参考图）是通过 `collectUpstreamData` 实时收集的，不需要显式清理
- 但对于 PromptNode、TextGenNode 等有本地数据存储的节点，删除连线后应清理通过连接同步的数据

**实现方案**：
1. 分析节点类型间的数据同步关系：
   - 文本节点（PromptNode、TextGenNode、TextNoteNode）→ 图片/视频节点：提供 `promptText`
   - 资产节点（AssetNode）→ 图片/视频节点：提供 `refImages` 参考图
   - 故事板节点（StoryboardNode）→ 图片/视频节点：提供 `sceneDescription` + `dialogue`

2. 由于 ImageOutputNode 和 VideoOutputNode 的上游数据是实时收集（`useMemo` + `collectUpstreamData`），删除连线后自动会更新，无需额外清理

3. 对于 PromptNode 等有本地 `lastOutput` 字段的节点，删除连线后应清理该字段

**修改文件**：
- `nextjs-frontend/app/(studio)/studio/[canvasId]/page.tsx`（在 `cleanupEdgeSideEffects` 函数中增加清理逻辑）

**关键代码逻辑**：
```typescript
const cleanupEdgeSideEffects = useCallback(async (edge: any) => {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  // 1. 原有：AssetBinding 清理
  if (sourceNode?.type === 'assetNode' && targetNode?.type === 'storyboardNode' && edge.targetHandle === 'in') {
    // ... 现有代码 ...
  }

  // 2. 新增：清理目标节点通过连接同步的数据
  // 当文本节点连接到图片/视频节点时，删除连线应清理目标节点的本地提示词
  const TEXT_SOURCE_TYPES = ['textNoteNode', 'scriptNode', 'textGenNode', 'storyboardNode', 'promptNode'];
  const TARGET_TYPES = ['imageOutputNode', 'videoOutputNode'];
  
  if (TEXT_SOURCE_TYPES.includes(sourceNode?.type) && TARGET_TYPES.includes(targetNode?.type)) {
    // 注意：ImageOutputNode/VideoOutputNode 的提示词是实时从上游收集的
    // 删除连线后 collectUpstreamData 会自动返回空，无需手动清理
    // 但如果目标节点有本地存储的 prompt 字段，可选择清空
    // 这里不做额外处理，因为 UI 会自动反映变化
  }
}, [nodes]);
```

**注意**：经过代码分析，ImageOutputNode 和 VideoOutputNode 的上游数据是通过 `collectUpstreamData` 实时计算的，删除连线后会自动反映变化，不需要额外清理。此任务可以标记为「无需修改」或「已满足」。

---

## 3. 实现任务清单

### 任务 1：视频节点自适应宽高比
- [ ] 1.1 在 `VideoOutputNode` 中添加 `onLoadedMetadata` 事件处理
- [ ] 1.2 获取视频实际尺寸并计算宽高比
- [ ] 1.3 更新节点数据存储实际宽高比
- [ ] 1.4 视频显示区域根据实际宽高比自适应

### 任务 2：顶部菜单 Undo/Redo 按钮
- [ ] 2.1 修改 `CanvasToolbar` 接口，添加 undo/redo 相关 props
- [ ] 2.2 添加 Undo/Redo 图标按钮，支持 disabled 状态
- [ ] 2.3 修改 `useUndoRedo` hook，添加 `Ctrl+Y` 快捷键
- [ ] 2.4 在 `page.tsx` 中传递 undo/redo 属性给 CanvasToolbar

### 任务 3：删除连线清理同步数据
- [ ] 3.1 分析节点间数据同步关系（已分析完成）
- [ ] 3.2 确认 ImageOutputNode/VideoOutputNode 上游数据实时计算特性（已确认）
- [ ] 3.3 验证删除连线后 UI 自动更新（测试验证）

---

## 4. 风险与注意事项

1. **视频尺寸获取时机**：需要在视频元数据加载完成后才能获取尺寸，要处理好加载状态
2. **节点尺寸同步**：调整节点尺寸后要确保 ReactFlow 的状态同步
3. **快捷键冲突**：确保 `Ctrl+Y` 不会与其他功能冲突
4. **按钮状态**：undo/redo 按钮在无历史记录时应显示为禁用状态
5. **连线清理**：当前架构使用实时数据收集，删除连线后 UI 自动更新，无需额外处理

---

## 5. 验收标准

1. **视频节点自适应**：
   - [ ] 视频生成完成后，节点能根据视频实际宽高比显示
   - [ ] 不同比例的视频（16:9、9:16、1:1 等）都能正确显示
   - [ ] 重新生成视频后，尺寸能正确更新

2. **Undo/Redo 工具栏**：
   - [ ] 顶部工具栏显示 Undo 和 Redo 图标按钮
   - [ ] 点击按钮能正确执行撤销/重做操作
   - [ ] `Ctrl+Z` 能执行撤销
   - [ ] `Ctrl+Y` 能执行重做
   - [ ] `Ctrl+Shift+Z` 仍能执行重做
   - [ ] 无历史记录时按钮显示禁用状态

3. **连线删除清理**：
   - [ ] 删除文本节点→图片节点的连线后，图片节点的提示词预览消失
   - [ ] 删除资产节点→图片节点的连线后，图片节点的参考图预览消失
   - [ ] 删除连线后，目标节点生成按钮正确禁用（当无上游文本时）
