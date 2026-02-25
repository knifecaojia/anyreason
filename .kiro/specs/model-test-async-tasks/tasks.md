# 实施计划：模型测试异步任务化

## 概述

将模型测试页面的图片/视频生成从同步 HTTP 请求重构为异步任务模式。按后端 Handler → 端点重构 → 前端适配 → API 路由清理的顺序渐进实施，每个阶段可独立验证。

## Tasks

- [x] 1. 实现后端图片生成任务处理器
  - [x] 1.1 创建 ModelTestImageGenerateHandler
    - 在 `fastapi_backend/app/tasks/handlers/` 下创建 `model_test_image_generate.py`
    - 继承 `BaseTaskHandler`，设置 `task_type = "model_test_image_generate"`
    - 实现 `run()` 方法：从 `input_json` 解析参数，调用 `ai_gateway_service.generate_media(category="image")`，通过 `vfs_service` 保存文件，通过 `ai_model_test_service.add_image_run()` 创建 Run 记录
    - 通过 `reporter.progress()` 上报进度（5% 开始、70% AI 调用完成、90% 文件保存完成）
    - 在 `except` 块中创建包含 `error_message` 的 ImageRun 记录后重新抛出异常
    - 返回 `result_json`：`{url, output_file_node_id, output_content_type, session_id, run_id}`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 创建 ModelTestVideoGenerateHandler
    - 在 `fastapi_backend/app/tasks/handlers/` 下创建 `model_test_video_generate.py`
    - 继承 `BaseTaskHandler`，设置 `task_type = "model_test_video_generate"`
    - 实现 `run()` 方法：从 `input_json` 解析参数，调用 `ai_gateway_service.generate_media(category="video")`，通过 `vfs_service` 保存文件，通过 `ai_model_test_service.add_video_run()` 创建 Run 记录
    - 通过 `reporter.progress()` 上报进度（5% 开始、50% AI 调用完成、85% 文件保存完成）
    - 在 `except` 块中创建包含 `error_message` 的 VideoRun 记录后重新抛出异常
    - 返回 `result_json`：`{url, output_file_node_id, output_content_type, session_id, run_id}`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.3 注册 Handler 到 TASK_HANDLER_REGISTRY
    - 修改 `fastapi_backend/app/tasks/handlers/registry.py`
    - 导入 `ModelTestImageGenerateHandler` 和 `ModelTestVideoGenerateHandler`
    - 在 `TASK_HANDLER_REGISTRY` 字典中添加两个 Handler 实例
    - _Requirements: 1.1, 2.1_

  - [x] 1.4 编写 Handler 单元测试
    - 在 `fastapi_backend/tests/` 下创建 `test_model_test_handlers.py`
    - 测试 ImageHandler 成功路径：mock `ai_gateway_service.generate_media` 和 `vfs_service`，验证 `result_json` 结构和 `add_image_run` 调用
    - 测试 VideoHandler 成功路径：同上，验证 `add_video_run` 调用
    - 测试 ImageHandler 错误路径：mock gateway 抛出异常，验证 `add_image_run` 被调用且包含 `error_message`
    - 测试 VideoHandler 错误路径：同上
    - 验证 `TASK_HANDLER_REGISTRY` 包含 `model_test_image_generate` 和 `model_test_video_generate`
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.4, 2.5_

  - [x] 1.5 编写属性测试：成功任务创建 Run 记录并返回完整 result_json
    - **Property 2: 成功任务创建 Run 记录并返回完整 result_json**
    - 使用 Hypothesis 生成随机 `input_json`，mock gateway 返回随机 URL，验证 `result_json` 包含 `url`、`session_id`、`run_id` 且 Run 记录已创建
    - **Validates: Requirements 1.4, 2.4, 6.1**

  - [x] 1.6 编写属性测试：失败任务创建包含错误信息的 Run 记录
    - **Property 3: 失败任务创建包含错误信息的 Run 记录**
    - 使用 Hypothesis 生成随机 `input_json`，mock gateway 抛出随机异常，验证 `add_image_run` / `add_video_run` 被调用且 `error_message` 非空
    - **Validates: Requirements 1.5, 2.5**

  - [x] 1.7 编写属性测试：任务执行过程中上报进度
    - **Property 4: 任务执行过程中上报进度**
    - 使用 Hypothesis 生成随机 `input_json`，记录 `reporter.progress` 调用，验证图片任务至少 2 次、视频任务至少 3 次，且进度值单调递增
    - **Validates: Requirements 1.6, 2.6**

- [x] 2. 重构后端端点为异步提交
  - [x] 2.1 新增异步响应 Schema
    - 在 `fastapi_backend/app/schemas/` 或端点文件中新增 `AdminAIModelConfigTestAsyncResponse` Pydantic 模型，包含 `task_id: str` 和 `session_id: str` 字段
    - _Requirements: 3.4_

  - [x] 2.2 重构 test-image 端点
    - 修改 `fastapi_backend/app/api/v1/ai_model_configs.py` 中的 `test-image` 端点
    - 保留参数验证和 `ensure_session` 逻辑
    - 保留附件预处理逻辑（读取 file_node → data URL），将 `image_data_urls` 存入 `input_json`
    - 将同步调用 `ai_gateway_service.generate_media()` 替换为 `task_service.create_task(type="model_test_image_generate", input_json={...})`
    - 返回 `{task_id, session_id}` 而非生成结果
    - _Requirements: 1.2, 3.1, 3.3, 3.4_

  - [x] 2.3 重构 test-video 端点
    - 修改 `fastapi_backend/app/api/v1/ai_model_configs.py` 中的 `test-video` 端点
    - 保留参数验证和 `ensure_session` 逻辑
    - 保留附件预处理逻辑，将 `image_data_urls` 存入 `input_json`
    - 将同步调用替换为 `task_service.create_task(type="model_test_video_generate", input_json={...})`
    - 返回 `{task_id, session_id}` 而非生成结果
    - _Requirements: 2.2, 3.2, 3.3, 3.4_

  - [x] 2.4 编写端点重构单元测试
    - 更新 `fastapi_backend/tests/routes/test_ai_model_config_test_image.py` 中的现有测试
    - 验证端点调用 `task_service.create_task()` 并返回 `{task_id, session_id}`
    - 验证 `input_json` 包含 `session_id`、`model_config_id`、`prompt` 等字段
    - 验证附件预处理后 `image_data_urls` 存入 `input_json`
    - _Requirements: 1.2, 2.2, 3.1, 3.2, 3.3, 3.4_

  - [x] 2.5 编写属性测试：异步端点响应格式
    - **Property 1: 异步端点响应格式**
    - 使用 Hypothesis 生成随机有效 prompt 和 model_config_id，mock 依赖，验证端点返回包含非空 `task_id` 和 `session_id` 的响应，且不包含 `url`、`run_id` 等生成结果字段
    - **Validates: Requirements 1.2, 2.2, 3.1, 3.2, 3.4**

  - [x] 2.6 编写属性测试：Task input_json 包含 session_id 和预处理后的附件数据
    - **Property 5: Task input_json 包含 session_id 和预处理后的附件数据**
    - 使用 Hypothesis 生成随机请求参数（含/不含附件），验证创建的 Task 的 `input_json` 包含 `session_id` 和 `model_config_id`，若有附件则包含 `image_data_urls`（每个元素以 `data:` 开头）
    - **Validates: Requirements 3.3, 6.2**

- [x] 3. Checkpoint - 后端验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 前端提交流程改为异步任务模式
  - [x] 4.1 注册任务类型常量
    - 修改 `nextjs-frontend/lib/tasks/constants.ts`
    - 在 `TASK_TYPES` 中添加 `modelTestImageGenerate: "model_test_image_generate"` 和 `modelTestVideoGenerate: "model_test_video_generate"`
    - _Requirements: 4.2_

  - [x] 4.2 重构 submitModelTestImage 提交逻辑
    - 修改 `nextjs-frontend/app/(aistudio)/settings/page.tsx` 中的 `submitModelTestImage` 函数
    - 调用端点获取 `task_id` 和 `session_id` 后立即显示"任务已提交"状态
    - 通过 `TaskProvider` 的 `useTasks()` 机制（WebSocket/轮询）订阅任务状态
    - 任务 `succeeded` 时从 `result_json` 提取 `url`、`output_file_node_id` 并创建对应的 ImageRun/VideoRun 展示
    - 任务 `failed` 时从事件中提取 `error` 并展示错误信息
    - 任务 `queued`/`running` 时显示进度百分比
    - 移除原有的 `AbortController` 超时控制逻辑（3 分钟/6 分钟超时）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.3 更新 ModelTestModal 组件适配异步状态
    - 修改 `nextjs-frontend/app/(aistudio)/settings/_components/ModelTestModal.tsx`
    - 适配新的异步任务状态展示（进度条、任务状态指示）
    - 确保图片和视频两种类别的任务状态正确映射到 UI
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [x] 4.4 编写前端提交流程单元测试
    - 测试提交后显示"任务已提交"状态
    - 测试任务 succeeded 事件触发结果展示
    - 测试任务 failed 事件触发错误展示
    - 测试进度百分比显示
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [x] 4.5 编写属性测试：前端任务状态正确映射到 UI 状态
    - **Property 6: 前端任务状态正确映射到 UI 状态**
    - 使用 fast-check 生成随机任务事件序列（queued → running/progress → succeeded 或 failed），验证 UI 状态转换正确：queued/running 时显示进度，succeeded 时展示结果 url，failed 时显示错误信息
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5**

- [x] 5. 前端 API 路由层简化
  - [x] 5.1 清理 test-video API 路由长超时配置
    - 修改 `nextjs-frontend/app/api/ai/admin/model-configs/[modelConfigId]/test-video/route.ts`
    - 移除 `export const maxDuration = 360`
    - 移除 `AbortSignal.timeout(5 * 60 * 1000)`
    - 保留认证代理转发逻辑不变
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 验证 test-image API 路由无长超时配置
    - 确认 `nextjs-frontend/app/api/ai/admin/model-configs/[modelConfigId]/test-image/route.ts` 无需修改（已无长超时配置）
    - _Requirements: 5.1, 5.3_

- [x] 6. 任务与测试会话关联验证
  - [x] 6.1 确保 Handler 中 Run 记录正确关联 Session
    - 验证 `ModelTestImageGenerateHandler` 和 `ModelTestVideoGenerateHandler` 在创建 Run 记录时使用 `input_json` 中的 `session_id`
    - 确保通过异步任务生成的 Run 记录与同步模式生成的记录格式一致，前端历史记录展示无需额外适配
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 6.2 编写会话关联集成测试
    - 测试完整流程：端点创建 Task → Handler 执行 → Run 记录关联到正确 Session
    - 验证前端查询测试会话详情时能获取到异步任务生成的历史记录
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Final Checkpoint - 全部验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- Checkpoint 确保增量验证，后端和前端分别验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 后端使用 Python (Hypothesis)，前端使用 TypeScript (fast-check) 进行属性测试
- 本次重构不涉及数据库 Schema 变更，所有数据通过现有 Task 的 JSONB 字段存储
