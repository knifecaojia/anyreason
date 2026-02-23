# 实施计划清单 (Tasks)

## Phase 1: 数据层与基础设施 (已完成 80%)
- [x] **文档抓取**: 编写并执行 `scripts/scrape_docs.py`，抓取 Volcengine, Aliyun, Vidu, Gemini 文档。
    - [x] 产物: `docs/vendor_model_reference/*.md`
- [x] **SQL 生成**: 编写 `scripts/generate_init_sql.py`，生成初始化 SQL。
    - [x] 产物: `sql/init/vendor_model_init.sql`
- [x] **数据库迁移脚本**: 创建 Alembic migration 文件。
    - [x] 产物: `fastapi_backend/alembic_migrations/versions/83ccec4a37bd_add_media_provider_columns.py`
- [ ] **执行迁移**: 运行 `alembic upgrade head` 应用变更并导入初始数据。
- [ ] **ORM 模型更新**: 更新 `fastapi_backend/app/models.py` 中的 `AIManufacturer` 和 `AIModel` 类，添加 `doc_url` 和 `param_schema` 字段定义。

## Phase 2: 后端核心逻辑开发 (Backend)
- [ ] **定义交互对象**: 在 `fastapi_backend/app/schemas_media.py` (新建) 中定义 `MediaRequest` 和 `MediaResponse` Pydantic 模型。
- [ ] **Provider 抽象基类**: 创建 `fastapi_backend/app/ai_gateway/providers/base_media.py`，定义 `MediaProvider` 接口。
- [ ] **厂商实现 (各 1-2 小时)**:
    - [ ] **Volcengine**: `fastapi_backend/app/ai_gateway/providers/media/volcengine.py` (适配 CV 接口签名)
    - [ ] **Aliyun**: `fastapi_backend/app/ai_gateway/providers/media/aliyun.py` (适配 DashScope SDK/API)
    - [ ] **Vidu**: `fastapi_backend/app/ai_gateway/providers/media/vidu.py` (适配视频生成参数)
    - [ ] **Gemini**: `fastapi_backend/app/ai_gateway/providers/media/gemini.py` (适配 Google AI Studio API)
- [ ] **工厂模式**: 实现 `MediaProviderFactory`，根据 `manufacturer.code` 返回对应实例。
- [ ] **API 路由**: 新增 `fastapi_backend/app/ai_gateway/api/v1/media.py`。
    - [ ] 实现 `POST /generate` 接口。
    - [ ] 集成 `jsonschema` 进行参数校验。
    - [ ] 集成 `CreditService` 进行扣费。

## Phase 3: 前端动态表单开发 (Frontend)
- [ ] **类型定义**: 在前端定义与后端一致的 `ParamSchema` TS 类型。
- [ ] **组件开发**: 创建 `components/ai/MediaGenerationForm.tsx`。
    - [ ] 实现基础字段渲染 (String -> Input, Integer -> Slider/Input, Boolean -> Switch, Enum -> Select)。
    - [ ] 处理 `ui:order` 排序。
    - [ ] 实现表单验证反馈。
- [ ] **页面集成**: 在 `app/(aistudio)/ai/image/page.tsx` 和 `video/page.tsx` 中集成该组件。
    - [ ] 添加模型选择下拉框 (从后端获取支持的模型列表)。
    - [ ] 串联生成 API 调用。

## Phase 4: 测试与交付 (QA & Delivery)
- [ ] **单元测试**:
    - [ ] 测试 Schema 校验逻辑 (非法参数应抛出 400)。
    - [ ] 测试 Factory 正确加载 Provider。
- [ ] **集成测试**:
    - [ ] 编写 `tests/integration/test_media_providers.py`，使用 Mock 模拟厂商 API 返回，验证流程跑通。
- [ ] **文档**:
    - [ ] 创建 `docs/adr/0003-model-param-schema.md`。
    - [ ] 更新 `README.md` 添加“如何新增媒体模型”章节。
