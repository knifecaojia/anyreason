# 需求文档

## 简介

将模型测试页面中的图片生成和视频生成功能从同步 HTTP 请求模式重构为使用项目已有的异步任务系统（Task System）。当前实现中，前端 fetch 等待后端返回结果，后端同步轮询 AI 供应商（如阿里云 DashScope）长达数分钟，容易导致 HTTP 超时。重构后，前端提交请求后立即获得任务 ID，后端通过异步任务系统处理生成逻辑，前端通过 TaskProvider 的 WebSocket/轮询机制获取任务状态和结果。

## 术语表

- **Task_System**: 项目已有的异步任务处理系统，包含任务队列（Redis/Celery/Inline）、任务处理器（BaseTaskHandler）、任务状态上报（TaskReporter）和前端 TaskProvider 轮询/WebSocket 机制
- **Task_Handler**: 继承自 BaseTaskHandler 的异步任务处理器，注册在 TASK_HANDLER_REGISTRY 中，负责执行具体的异步任务逻辑
- **Task_Reporter**: 任务状态上报器，提供 progress / succeed / fail / log 方法，通过 Redis Pub/Sub 推送任务事件
- **Model_Test_Endpoint**: 后端 `/api/v1/ai/admin/model-configs/{id}/test-image` 和 `test-video` 两个 API 端点
- **Model_Test_Service**: `AIModelTestService`，负责管理模型测试会话（Session）和运行记录（Run）
- **Frontend_Settings_Page**: 前端设置页面中的模型测试功能，包含 `submitModelTestImage` 函数和 `ModelTestModal` 组件
- **Frontend_API_Route**: Next.js API 路由层，作为前端到后端的代理（`/api/ai/admin/model-configs/[modelConfigId]/test-image` 和 `test-video`）
- **AI_Gateway**: `ai_gateway_service.generate_media()` 统一媒体生成接口，负责调用 AI 供应商 API 并轮询结果
- **Test_Session**: 模型测试会话，包含多次运行记录，关联特定模型配置
- **Test_Run**: 单次模型测试运行记录（ImageRun / VideoRun），记录输入参数、输出结果和错误信息

## 需求

### 需求 1：后端图片生成任务处理器

**用户故事：** 作为开发者，我希望图片生成测试通过异步任务系统执行，以避免 HTTP 请求超时问题。

#### 验收标准

1. THE Task_System SHALL 包含一个类型为 `model_test_image_generate` 的 Task_Handler，注册在 TASK_HANDLER_REGISTRY 中
2. WHEN Model_Test_Endpoint 收到图片生成测试请求时，THE Model_Test_Endpoint SHALL 创建一个 Task 记录（类型为 `model_test_image_generate`，input_json 包含 prompt、resolution、model_config_id、session_id、attachment_file_node_ids 等参数），将其入队，并立即返回 task_id 和 session_id
3. WHEN Task_Handler 执行图片生成任务时，THE Task_Handler SHALL 调用 AI_Gateway 的 generate_media 方法生成图片
4. WHEN 图片生成成功时，THE Task_Handler SHALL 将生成结果（url、output_file_node_id、output_content_type）保存到 Task 的 result_json 中，并通过 Model_Test_Service 创建对应的 ImageRun 记录
5. IF 图片生成过程中发生错误，THEN THE Task_Handler SHALL 通过 Task_Reporter 上报失败状态，并通过 Model_Test_Service 创建包含 error_message 的 ImageRun 记录
6. WHILE Task_Handler 执行图片生成任务时，THE Task_Handler SHALL 通过 Task_Reporter 上报进度（至少包含开始和完成两个进度节点）

### 需求 2：后端视频生成任务处理器

**用户故事：** 作为开发者，我希望视频生成测试通过异步任务系统执行，以避免长时间轮询导致的 HTTP 超时。

#### 验收标准

1. THE Task_System SHALL 包含一个类型为 `model_test_video_generate` 的 Task_Handler，注册在 TASK_HANDLER_REGISTRY 中
2. WHEN Model_Test_Endpoint 收到视频生成测试请求时，THE Model_Test_Endpoint SHALL 创建一个 Task 记录（类型为 `model_test_video_generate`，input_json 包含 prompt、duration、aspect_ratio、model_config_id、session_id、attachment_file_node_ids 等参数），将其入队，并立即返回 task_id 和 session_id
3. WHEN Task_Handler 执行视频生成任务时，THE Task_Handler SHALL 调用 AI_Gateway 的 generate_media 方法生成视频
4. WHEN 视频生成成功时，THE Task_Handler SHALL 将生成结果（url、output_file_node_id、output_content_type）保存到 Task 的 result_json 中，并通过 Model_Test_Service 创建对应的 VideoRun 记录
5. IF 视频生成过程中发生错误，THEN THE Task_Handler SHALL 通过 Task_Reporter 上报失败状态，并通过 Model_Test_Service 创建包含 error_message 的 VideoRun 记录
6. WHILE Task_Handler 执行视频生成任务时，THE Task_Handler SHALL 通过 Task_Reporter 上报进度（至少包含开始、AI 调用中、下载/保存中三个进度节点）

### 需求 3：后端端点重构为异步提交

**用户故事：** 作为开发者，我希望 test-image 和 test-video 端点立即返回任务 ID，而不是阻塞等待生成完成。

#### 验收标准

1. WHEN 前端调用 test-image 端点时，THE Model_Test_Endpoint SHALL 在验证参数和创建/获取 Test_Session 后，创建 Task 并入队，在 3 秒内返回包含 task_id 和 session_id 的响应
2. WHEN 前端调用 test-video 端点时，THE Model_Test_Endpoint SHALL 在验证参数和创建/获取 Test_Session 后，创建 Task 并入队，在 3 秒内返回包含 task_id 和 session_id 的响应
3. THE Model_Test_Endpoint SHALL 在创建 Task 时将附件处理逻辑（读取 file_node 数据、转换为 data URL）保留在端点中执行，将处理后的 image_data_urls 存入 Task 的 input_json
4. THE Model_Test_Endpoint 的响应格式 SHALL 包含 task_id（字符串）和 session_id（字符串）字段

### 需求 4：前端提交流程改为异步任务模式

**用户故事：** 作为用户，我希望提交图片/视频生成测试后立即看到"任务已提交"的反馈，而不是等待数分钟的加载状态。

#### 验收标准

1. WHEN 用户在 Frontend_Settings_Page 提交图片或视频生成测试时，THE Frontend_Settings_Page SHALL 调用对应端点获取 task_id，并立即显示任务已提交状态
2. WHEN Frontend_Settings_Page 获得 task_id 后，THE Frontend_Settings_Page SHALL 通过现有的 TaskProvider 机制（WebSocket 或轮询）监听任务状态变化
3. WHEN 任务状态变为 succeeded 时，THE Frontend_Settings_Page SHALL 从任务的 result_json 中提取生成结果（url、output_file_node_id）并展示
4. WHEN 任务状态变为 failed 时，THE Frontend_Settings_Page SHALL 显示任务的错误信息
5. WHILE 任务处于 queued 或 running 状态时，THE Frontend_Settings_Page SHALL 显示进度指示（包含进度百分比）
6. THE Frontend_Settings_Page SHALL 移除原有的前端超时控制逻辑（AbortController 的 3 分钟/6 分钟超时）

### 需求 5：前端 API 路由层简化

**用户故事：** 作为开发者，我希望 Next.js API 路由层不再需要长超时配置，因为后端端点已变为快速返回。

#### 验收标准

1. THE Frontend_API_Route 的 test-image 路由 SHALL 移除长超时相关配置，使用默认超时
2. THE Frontend_API_Route 的 test-video 路由 SHALL 移除 `maxDuration = 360` 配置和 `AbortSignal.timeout(5 * 60 * 1000)` 长超时设置
3. THE Frontend_API_Route SHALL 继续作为认证代理，将请求转发到后端 Model_Test_Endpoint

### 需求 6：任务与测试会话关联

**用户故事：** 作为用户，我希望异步任务的结果能正确关联到测试会话的历史记录中，以便查看历史测试结果。

#### 验收标准

1. WHEN Task_Handler 成功完成图片或视频生成时，THE Task_Handler SHALL 通过 Model_Test_Service 创建 Test_Run 记录，关联到对应的 Test_Session
2. THE Task 的 input_json SHALL 包含 session_id 字段，使 Task_Handler 能够将结果关联到正确的 Test_Session
3. WHEN 用户查看测试会话详情时，THE Frontend_Settings_Page SHALL 能够展示通过异步任务生成的历史运行记录（与之前同步模式生成的记录格式一致）
