# 资产创作绑定与页面重构方案

## 1. 核心目标
1.  **数据打通**：将剧本分解产生的资产（角色/道具）自动转化为数据库中的 `Asset` 实体。
2.  **页面重构**：重构前端 `Asset Management` 页面，移除 Mock 数据，接入真实后端 API，展示自动生成的资产。
3.  **绑定闭环**：实现“AI 生成图片 -> 绑定到自动创建的资产 -> 资产列表展示封面”的完整闭环。

## 2. 现状分析
*   **前端**：`assets/page.tsx` 依赖 `ASSETS` 常量（Mock 数据），虽有 `hierarchy` 接口调用但未有效用于资产列表展示。
*   **后端**：
    *   `Asset` 模型缺乏来源标识（人工创建 vs 剧本提取）。
    *   缺少标准的 `GET /assets` 列表接口，无法按剧本/项目筛选资产。
    *   剧本分解逻辑仅存储资产名称字符串，未创建 `Asset` 实体。

## 3. 详细实施方案

### 3.1 后端改造 (FastAPI)

#### A. 模型升级
*   **修改文件**：`fastapi_backend/app/models.py`
*   **内容**：
    *   在 `Asset` 模型中添加 `source` 字段 (Enum: `manual`, `script_extraction`)。
    *   在 `Asset` 模型中添加 `script_id` 字段（可选，用于关联特定剧本，若资产属于项目全局可为空）。

#### B. API 开发
*   **修改文件**：`fastapi_backend/app/api/v1/assets.py`
*   **内容**：
    *   新增 `GET /api/v1/assets` 接口。
    *   支持查询参数：`project_id` (必填), `script_id` (选填), `source` (选填)。
    *   返回数据结构：包含 `id`, `name`, `type`, `status`, `thumbnail` (即默认变体的第一张资源), `source`。

#### C. 业务逻辑增强
*   **修改文件**：`fastapi_backend/app/services/ai_storyboard_service.py`
*   **内容**：
    *   在 `apply_plans` 方法中，解析 `active_assets`。
    *   调用 `AssetService.get_or_create`：
        *   若资产不存在：创建新 `Asset`，设置 `source='script_extraction'`, `status='draft'`。
        *   若资产已存在：建立 `AssetBinding` 关联。

### 3.2 前端重构 (Next.js)

#### A. 数据层重构
*   **修改文件**：`nextjs-frontend/app/(aistudio)/assets/page.tsx`
*   **内容**：
    *   **移除 Mock**：删除 `ASSETS` 常量的引用。
    *   **接入 API**：使用 `useSWR` 或 `fetch` 调用新开发的 `GET /api/v1/assets?script_id={selectedScriptId}`。
    *   **状态管理**：处理 `loading`, `empty` 状态。

#### B. UI 组件优化
*   **修改文件**：`nextjs-frontend/app/(aistudio)/assets/asset-card.tsx` (或内联组件)
*   **内容**：
    *   **草稿状态适配**：对于自动创建但未绑定图片的资产，显示“待生成”或“AI 提取”的占位符样式。
    *   **来源标识**：在 Card 上增加小图标或标签，区分是“人工上传”还是“剧本提取”。

#### C. 交互逻辑完善
*   **修改文件**：`nextjs-frontend/app/(aistudio)/assets/page.tsx` (HandleSaveAsset)
*   **内容**：
    *   在“保存图片到资产”的弹窗/下拉框中，确保能列出所有（包括自动生成的）资产。
    *   保存成功后，触发资产列表刷新，确保刚绑定的图片立即作为封面显示。

## 4. 执行计划

### Phase 1: 后端基础设施 (Backend)
1.  [ ] 修改 `Asset` 模型，增加 `source` 字段，生成并应用数据库迁移。
2.  [ ] 实现 `GET /api/v1/assets` 接口及对应的 Service 方法。
3.  [ ] 修改 `AIStoryboardService`，实现剧本分解时的资产自动创建逻辑。

### Phase 2: 前端页面重构 (Frontend)
1.  [ ] 封装 `getAssets` API 请求函数。
2.  [ ] 重构 `assets/page.tsx`，移除 Mock 数据，接入真实数据流。
3.  [ ] 优化 `AssetCard` 组件，适配无图/草稿状态的显示。

### Phase 3: 联调与验证
1.  [ ] **全链路测试**：
    *   上传新剧本 -> AI 分解 -> 确认资产库出现新资产（无图）。
    *   进入创作工坊 -> 生成图片 -> 保存并选择该新资产 -> 确认资产库更新封面。
2.  [ ] **回归测试**：确保原有手动创建资产流程不受影响。

## 5. 审批请求
请确认是否同意上述重构方案，特别是：
1.  **数据迁移**：现有资产默认为 `source='manual'`。
2.  **API 变更**：新增标准的资产列表接口。
