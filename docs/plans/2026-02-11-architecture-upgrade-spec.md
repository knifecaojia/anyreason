# 系统架构升级技术规格书 (v1.0)

> **日期**: 2026-02-11
> **状态**: 已实施
> **目标**: 扁平化剧本层级、混合资产管理、多级权限控制

---

## 1. 数据库模型变更 (Database Schema)

### 1.1 核心层级扁平化
*   **Deleted**: `scenes`, `shots` 表。
*   **Added**: `storyboards` 表。
    *   将原 `Scene` 的时空属性（`location`, `time_of_day`）下沉为 `Storyboard` 的字段。
    *   `scene_number` 保留作为虚拟分组标识。
*   **Updated**: `Episode` 现直接关联 `Storyboard`。

### 1.2 虚拟文件系统 (VFS)
*   **Added**: `file_nodes` 表。
    *   支持无限层级目录结构 (`parent_id`)。
    *   支持 `workspace_id` 和 `project_id` 隔离。
    *   存储 MinIO 引用 (`minio_bucket`, `minio_key`)。

### 1.3 权限体系
*   **Added**: `workspaces` 表。
*   **Added**: `workspace_members` 表 (关联 `User` 与 `Workspace`，含 `role` 字段)。
*   **Updated**: `Project` 现归属于 `Workspace`。

---

## 2. 后端服务升级

### 2.1 ScriptStructureService
*   **Refactored**: 解析逻辑适配 `Episode -> Storyboard` 结构。
*   **Logic**: 初始解析时，每个“场”映射为一个 `Storyboard`，后续由 AI 拆解为多个分镜。

### 2.2 VFSService
*   **New**: 实现文件/文件夹的 CRUD 操作。
*   **Storage**: 集成 MinIO，实现文件流上传。

### 2.3 PermissionGuard
*   **New**: 实现了基于角色的依赖注入 (`require_workspace_member`, `require_workspace_admin`)。

---

## 3. 前端组件开发 (React/Next.js)

### 3.1 StoryboardTimeline
*   **New**: 替代旧版分层 UI。
*   **Features**: 线性时间轴视图，支持按“场”虚拟分组，直观展示分镜流。

### 3.2 AssetBrowser
*   **New**: 网盘式资源管理器。
*   **Features**: 文件夹导航，列表/网格视图切换，文件上传入口。

### 3.3 Auth Components
*   **PermissionGate**: 指令式权限控制组件，无权限自动隐藏子元素。
*   **WorkspaceSwitcher**: 全局工作空间切换器。

---

## 4. 下一步计划 (Next Steps)

1.  **数据迁移**: 编写 Alembic 脚本，将现有的 `Scene/Shot` 数据迁移至 `Storyboard` 表。
2.  **API 对接**: 将前端新组件 (`AssetBrowser`, `StoryboardTimeline`) 对接到后端新 API。
3.  **UI 完善**: 完善 `AssetBrowser` 的拖拽上传和文件预览功能。
