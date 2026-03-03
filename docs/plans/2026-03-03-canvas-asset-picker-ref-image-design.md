# 画布资产选择器 + 参考图输入 设计方案

## 日期: 2026-03-03

## Phase 1 已完成 ✅
1. **模型下拉框 UI 优化** — 文字 `text-[10px]` → `text-xs`(12px），ChevronDown 9→11，下拉菜单加 `shadow-lg`，选中项加 `font-medium`
2. **图片节点上传支持** — 编辑视图底部工具栏增加 Upload 按钮，通过 VFS `/api/vfs/files/upload` 上传，自动获取缩略图/原图 URL
3. **资产节点 UI 统一** — AssetNode 重写为与 ImageOutputNode 相同的布局：标题栏 + object-contain 缩略图 + 底部胶囊栏 + 双击预览

---

## Phase 2: 资产选择器对话框

### 需求
- 从节点库拖拽"资产节点"到画布时，弹出资产选择器对话框
- 对话框预览当前选中剧集的资产文件（图片、视频等）
- 未选择剧集时加载所有资产
- Tab 页切换：场景、角色、道具、特效、其他
- 支持上传新资产

### 设计
1. **新组件**: `components/canvas/AssetPickerDialog.tsx`
   - Props: `open`, `onClose`, `onSelect(asset)`, `episodeId?`
   - 内部 Tab: `scene | character | prop | vfx | other`
   - 资产列表从 `/api/v1/assets?episode_id=xxx&type=xxx` 获取
   - 网格布局展示缩略图，点击选择

2. **画布页修改**: `app/(studio)/studio/[canvasId]/page.tsx`
   - `onDrop` 中，当 `nodeTypeStr === 'assetNode'` 时，不直接创建节点
   - 改为打开 AssetPickerDialog，用户选择资产后再创建带数据的节点
   - 状态: `pendingAssetDrop: { position } | null`

3. **上传**: 对话框内增加上传按钮，复用 VFS upload API

### API 依赖
- `GET /api/v1/assets` — 列表查询（已有）
- `GET /api/vfs/nodes/{id}/thumbnail` — 缩略图（已有）
- `POST /api/vfs/files/upload` — 上传（已有）

---

## Phase 2: 图片节点作为参考图输入

### 需求
- ImageOutputNode 的输出可以连接到下一个 ImageOutputNode 的输入
- 下游节点自动将上游图片作为参考图（reference image）
- 支持 `@` 符号在提示词中引用绑定的参考图

### 设计
1. **边数据类型扩展**:
   - 当前边只传 text（`rawData['in']`）
   - 扩展为支持传递 `{ text?, imageUrl?, imageNodeId? }` 结构
   - 在 `workflow-generator.ts` 或运行时解析

2. **ImageOutputNode 输入处理**:
   - 读取 `rawData['in']` 时，检查是否为图片 URL
   - 如果是图片 URL，存入 `referenceImages` 数组
   - 在 `handleGenerate` 中将 referenceImages 传入 `input_json`

3. **@ 符号绑定** (Phase 3):
   - 提示词输入框支持 `@image-1` 语法
   - 弹出自动补全菜单，列出画布上所有图片节点
   - 选择后插入图片引用标记
   - 生成时解析标记为实际图片 URL

### 后端支持
- `asset_image_generate` 任务类型需支持 `reference_images` 参数
- AI 模型 API 调用时传入参考图 URL（部分模型支持）
