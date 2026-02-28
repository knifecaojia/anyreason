# AI 模型配置导入导出功能实现方案

## 1. 目标
在“模型引擎”设置页面添加“导入”和“导出”按钮，实现：
1.  **导出**：将数据库中所有的模型厂商、模型、模型配置和 Key 全部导出为 JSON 文件。Key 必须为明文。
2.  **导入**：支持将导出的 JSON 文件导入到系统，并进行去重判断（Upsert）。

## 2. 后端实现 (FastAPI)

### 2.1 新增 Router
创建 `app/api/v1/ai_model_import_export.py`，包含两个接口：

1.  **导出接口** `GET /api/v1/ai/models/export`
    *   权限：仅超级用户 (`current_superuser`)。
    *   逻辑：
        *   查询 `AIManufacturer`、`AIModel`、`AIModelConfig`、`AIModelBinding` 表。
        *   解密 `AIModelConfig.encrypted_api_key` 为明文 `api_key`。
        *   组装 JSON 数据，包含版本信息和导出时间。
        *   返回文件流 (`StreamingResponse`)。

2.  **导入接口** `POST /api/v1/ai/models/import`
    *   权限：仅超级用户 (`current_superuser`)。
    *   参数：`file: UploadFile`。
    *   逻辑：
        *   解析上传的 JSON 文件。
        *   **厂商 (Manufacturers)**：按 `(code, category)` 去重/更新。记录 ID 映射。
        *   **模型 (Models)**：按 `(manufacturer_id, code)` 去重/更新。使用厂商 ID 映射关联新厂商。
        *   **配置 (Configs)**：按 `(category, manufacturer, model)` 去重/更新。将明文 `api_key` 加密存储。记录 ID 映射。
        *   **绑定 (Bindings)**：按 `(key, category)` 去重/更新。使用配置 ID 映射关联新配置。
        *   返回操作统计信息（新增/更新数量）。

### 2.2 注册 Router
在 `app/api/v1/__init__.py` 中注册新 Router。

## 3. 前端实现 (Next.js)

### 3.1 修改 UI 组件
修改 `app/(aistudio)/settings/_components/ModelsSection.tsx`：

1.  **添加状态与引用**：
    *   `importing` 状态控制 Loading。
    *   `fileInputRef` 用于隐藏的文件输入框。

2.  **实现处理函数**：
    *   `handleExport`：调用导出接口，触发浏览器下载。
    *   `handleImport`：
        *   弹出确认框（提示 Key 将重置加密）。
        *   调用导入接口上传文件。
        *   成功后显示统计信息并刷新页面 (`window.location.reload()`)。

3.  **添加按钮**：
    *   在“厂商与模型管理”区域标题旁添加“导入”和“导出”按钮。
    *   “导入”按钮带有 Loading 状态。
    *   使用隐藏的 `<input type="file">` 触发文件选择。

## 4. 安全性
*   导出/导入接口均由 `current_superuser` 保护，确保只有管理员可操作。
*   导出时 Key 为明文（需求如此），文件名包含时间戳。
*   导入时 Key 会被重新加密，适应当前环境的 `ACCESS_SECRET_KEY`。

## 5. 验证
*   导出文件应包含所有模型数据，且 `api_key` 为字符串。
*   导入文件应能正确更新现有配置或创建新配置。
*   导入后 Key 应能正常使用（已被正确加密）。
