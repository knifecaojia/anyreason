# 验收核对单 (Checklist)

## 1. 数据完整性 (Data Integrity)
- [ ] **数据库结构**: `ai_manufacturers` 表包含 `doc_url` 字段，`ai_models` 表包含 `param_schema` 字段。
- [ ] **初始数据**: 数据库中已预置 Volcengine, Aliyun, Vidu, Gemini 的主要模型数据。
    - [ ] 每个模型均有正确的 `param_schema` JSON 数据。
    - [ ] 每个厂商均有 `doc_url` 指向官方文档。
- [ ] **ORM 一致性**: `fastapi_backend/app/models.py` 与数据库实际结构一致。

## 2. 后端功能 (Backend Functionality)
- [ ] **API 接口**: `POST /v1/media/generate` 可用。
- [ ] **参数校验**: 
    - [ ] 传递符合 Schema 的参数 -> 返回 200/成功。
    - [ ] 传递类型错误或超范围的参数 -> 返回 400 错误，提示具体字段。
- [ ] **厂商调用**:
    - [ ] **Volcengine**: 能够成功发起图片/视频生成请求。
    - [ ] **Aliyun**: 能够成功发起万象模型请求。
    - [ ] **Vidu**: 能够成功发起视频生成。
    - [ ] **Gemini**: 能够成功发起 Imagen 请求。
- [ ] **标准化响应**: 所有厂商返回的数据结构统一为 `MediaResponse` (url, usage_id, cost)。

## 3. 前端体验 (Frontend UX)
- [ ] **动态渲染**: 切换不同模型时，右侧参数配置面板实时更新。
- [ ] **控件交互**: 
    - [ ] 滑块 (Slider) 拖动顺滑，有数值显示。
    - [ ] 下拉框 (Select) 选项正确。
- [ ] **错误处理**: API 返回错误时，前端有 Toast 或 Alert 提示。

## 4. 工程质量 (Quality)
- [ ] **测试覆盖**: 核心逻辑 (Gateway, Provider Factory, Schema Validation) 单元测试通过。
- [ ] **文档**: 
    - [ ] `docs/adr/0003-model-param-schema.md` 存在且内容详实。
    - [ ] 代码中包含必要的 Type Hint 和 Docstring。
