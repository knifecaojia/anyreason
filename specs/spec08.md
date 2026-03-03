# Spec-08: 创作工坊无限画布 UI 重构方案

> 参考素材: `refs/images/kn/` 6 张截图
> 设计原则来源: 用户 + 参考图综合

---

## 一、核心设计原则（用户明确要求）

| # | 原则 | 说明 |
|---|------|------|
| P1 | **极简模式** | 画布默认极简，去除多余边框/标题栏/chrome，视觉留白最大化 |
| P2 | **节点 icon 化** | 节点默认收起为小 icon（~40×40），点击 + 号展开为完整编辑态；缩小时自动收为 icon |
| P3 | **缩放下限更小** | minZoom 从默认 0.5 降到 **0.1**，允许鸟瞰全局布局 |
| P4 | **分组支持** | 新增 GroupNode（分组框），框内节点逻辑成组，可对分组整体执行批量任务 |

---

## 二、参考图提取的设计要素

| 要素 | 来源截图 | 当前实现 | 目标 |
|------|---------|---------|------|
| 备注卡片 = 纯色块、无标题栏 | 画布布局 | NodeShell 统一外壳 | 去 NodeShell，纯色块直接编辑 |
| 文本节点 = 标签+字数+textarea+底部工具栏 | 文本和图片样式 | TextGenNode 嵌 NodeShell | 自定义轻量外壳 |
| 图片/视频 = 分开的独立输出节点 | 流程节点样式 | 合一的 GeneratorNode | 拆为 ImageOutputNode + VideoOutputNode |
| 媒体全出血显示 + 尺寸标注 | 流程节点样式 | 固定高度缩略图 | 自适应尺寸 + 角标 |
| 连线 = 虚线曲线 | 全部截图 | 实线贝塞尔 | 虚线贝塞尔 |
| 手柄 = + 圆形按钮 | 全部截图 | 小圆点 | 更大的 + 按钮 |
| 节点可拖拽缩放 | 画布布局 | 不支持 | NodeResizer |
| 选中浮动工具栏 | 图文生图 | 无 | NodeToolbar(编辑/下载/执行) |
| 底部模型+宽高比选择 | 流程节点样式 | 无 | 每个输出节点底部 |
| 提示词面板与节点物理分开 | 提示词固定位置 | 嵌入节点 | 浮动面板 |
| 提示词模板选择器 | 提示词模版 | 无 | 模态弹窗 |

---

## 三、整合后的改动清单

### Phase 1 — 画布基础 + 极简骨架（P0，先做）

#### 1.1 minZoom 降低（原则 P3）
- `ReactFlow` 组件添加 `minZoom={0.1}` `maxZoom={2}`
- 文件: `page.tsx`
- 工作量: 5 分钟

#### 1.2 连线改虚线（参考图）
- `TypedEdge.tsx` 默认 `strokeDasharray: '8 6'`，降低 strokeWidth 至 1.5
- 传输中状态改为虚线流动动画
- 文件: `TypedEdge.tsx`
- 工作量: 30 分钟

#### 1.3 连接手柄改 + 按钮（参考图）
- `NodeShell.tsx` PortHandles 改为 `w-5 h-5` 圆形，居中显示 `+` 图标
- 默认半透明，hover 时高亮
- 文件: `NodeShell.tsx`
- 工作量: 1 小时

#### 1.4 节点 icon 模式（原则 P2，最核心）
- 所有节点新增 **icon 态**（`renderLevel: 'icon'`），表现为 ~40×40 的圆角小方块：
  - 中央显示节点类型 icon（如 📝/🖼/🎬/✏️）
  - 右下角 `+` 展开按钮
  - hover 显示节点名称 tooltip
- 展开/收起逻辑:
  - 点击 `+` → 切换到完整编辑态（`renderLevel: 'full'`）
  - 点击节点外空白区域 或 点击节点上的 `-` → 收回 icon 态
  - 缩放到 zoom < 0.3 时，所有不在视口内的节点自动降级为 icon 态
- 修改 `performance.ts` 添加 `'icon'` 作为最低级别 RenderLevel
- 文件: `performance.ts`, `NodeShell.tsx`, 所有节点组件, `types.ts`
- 工作量: 4 小时

### Phase 2 — 节点视觉重构（P0）

#### 2.1 TextNoteNode → 纯色卡片
- 移除 NodeShell 包裹
- 纯色背景（可选紫/蓝/绿/黄），无标题栏，内容直接 contentEditable
- icon 态: 紫色小方块 + ✏️ 图标
- 支持 NodeResizer 拖拽缩放
- 文件: `TextNoteNode.tsx`
- 工作量: 2 小时

#### 2.2 TextGenNode → 轻量编辑器壳
- 自定义外壳取代 NodeShell:
  - 顶部轻量行: 「文本」标签 + 字数统计（右对齐）
  - 主体: textarea（支持 `/` 斜杠命令 placeholder）
  - 底部工具栏: 模型 Dropdown + 「提示词 ⇄」按钮
- icon 态: 深色小方块 + 📝 图标
- 文件: `TextGenNode.tsx`
- 工作量: 3 小时

#### 2.3 GeneratorNode 拆分
- 废弃当前 GeneratorNode 的图像/视频模式切换
- 新建 `ImageOutputNode.tsx`:
  - 顶部标签: 「图片」+ 尺寸标注(如 960×585)
  - 空态: 虚线边框 + 占位图标 + 右上角上传按钮
  - 有内容: 全出血显示图片
  - 底部: 模型 Dropdown + 宽高比 Dropdown + 「提示词 ⇄」
  - icon 态: 灰色小方块 + 🖼 图标
- 新建 `VideoOutputNode.tsx`: 同上但显示视频播放器
  - icon 态: 灰色小方块 + 🎬 图标
- 注册新节点类型到 `node-registry.ts` + `types.ts`
- 标记 GeneratorNode 为 @deprecated，保留 lazy migration
- 文件: 新建 2 文件 + `node-registry.ts` + `types.ts` + migration
- 工作量: 5 小时

### Phase 3 — 分组节点（原则 P4）

#### 3.1 GroupNode 实现
- 新建 `GroupNode.tsx`:
  - 视觉: 虚线/半透明边框的大矩形容器，左上角显示分组名称（可编辑）
  - 可拖拽缩放（NodeResizer）
  - 右上角操作按钮: ▶ 执行分组 / 折叠分组
  - 折叠态: 收为带名称的小色块，显示内部节点数
- ReactFlow 配置:
  - 子节点设置 `parentId` 指向 GroupNode
  - 拖入/拖出分组: 监听 `onNodeDragStop`，检测是否落入 GroupNode 范围
- 分组执行:
  - 「执行分组」按钮调用已有的 batch execute API，传入分组内所有节点 ID
  - 复用 `useBatchQueue` hook
- 类型定义:
  ```ts
  interface GroupNodeData extends BaseNodeData {
    kind: 'group';
    name: string;
    color?: string; // 分组边框颜色
  }
  ```
- 文件: 新建 `GroupNode.tsx` + `types.ts` + `node-registry.ts` + `page.tsx`
- 工作量: 6 小时

### Phase 4 — 交互增强（P1）

#### 4.1 选中节点浮动工具栏
- 使用 ReactFlow `NodeToolbar` 组件
- 图片/视频节点选中时顶部浮现: 编辑 / 下载 / 全屏 / 执行
- 文本节点选中时: 执行 / 复制 / 模板
- 文件: 新建 `NodeFloatingToolbar.tsx` + 各节点组件集成
- 工作量: 3 小时

#### 4.2 节点可缩放
- TextNoteNode / ImageOutputNode / VideoOutputNode / GroupNode 启用 `@xyflow/react` 的 `NodeResizer`
- 右下角拖拽手柄
- 文件: 各节点组件
- 工作量: 2 小时

### Phase 5 — 提示词体系（P2）

#### 5.1 浮动提示词面板
- 点击「提示词 ⇄」按钮时，在画布固定位置（不跟随缩放）弹出配置面板
- 面板内容: 网络搜索开关 + 系统提示词编辑 + 默认提示词编辑
- 逻辑关联到当前选中/操作的节点
- 文件: 新建 `PromptConfigPanel.tsx` + `page.tsx` 集成
- 工作量: 4 小时

#### 5.2 提示词模板选择器
- 模态弹窗，分类 Tab + 网格卡片 + 右侧详情预览
- 「做同款」按钮将模板内容填入当前节点
- 文件: 新建 `PromptTemplateModal.tsx`
- 工作量: 4 小时

---

## 四、执行顺序与里程碑

```
Phase 1 (1天)  ─── 极简骨架
  1.1 minZoom → 1.2 虚线连线 → 1.3 +手柄 → 1.4 icon模式

Phase 2 (2天)  ─── 节点视觉
  2.1 备注卡片 → 2.2 文本编辑器 → 2.3 图片/视频拆分

Phase 3 (1天)  ─── 分组节点
  3.1 GroupNode 完整实现

Phase 4 (1天)  ─── 交互增强
  4.1 浮动工具栏 → 4.2 节点缩放

Phase 5 (1天)  ─── 提示词体系
  5.1 浮动面板 → 5.2 模板选择器
```

总计约 **6 个工作日**。

---

## 五、注意事项

- 所有改动保持向后兼容: 旧快照中的 GeneratorNode 通过 lazy migration 自动转换
- icon 态需要与现有性能模式(`usePerformanceMode`)集成，zoom < 0.3 时自动触发
- 分组节点的批量执行复用现有 `canvas_batch_execute` 后端 handler
- 每个 Phase 完成后可独立验收
