# 实现计划：多厂商媒体生成模型集成

## 概述

本实现计划将多厂商媒体生成模型集成功能分解为可执行的编码任务，按照数据库迁移 → 模型更新 → Provider 实现 → API 扩展 → 前端组件的顺序逐步推进。

## 任务列表

- [x] 1. 数据库迁移：扩展 AIModel 表
  - [x] 1.1 创建 Alembic 迁移脚本，为 AIModel 表添加 `model_capabilities` JSONB 字段和 `category` VARCHAR(16) 字段
    - 添加 `model_capabilities` 字段，默认值为空 JSON 对象
    - 添加 `category` 字段，允许值为 `text`、`image`、`video`
    - 创建 `idx_ai_models_category` 索引
    - 添加 CHECK 约束确保 category 值有效
    - _需求: 1.1, 1.5_

  - [x] 1.2 更新 SQLAlchemy AIModel 模型定义
    - 在 `AIModel` 类中添加 `model_capabilities: Mapped[dict]` 字段，类型为 JSONB
    - 添加 `category: Mapped[str | None]` 字段
    - _需求: 1.1, 1.5_

- [x] 2. 检查点 - 确保数据库迁移成功
  - 运行迁移脚本，验证表结构变更
  - 确保所有测试通过，如有问题请询问用户

- [x] 3. 实现 GeminiProxyProvider 中转 API 提供者
  - [x] 3.1 创建 `GeminiProxyProvider` 类，继承 `MediaProvider` 抽象基类
    - 实现 `__init__` 方法，接收 `api_key`、`base_url`、`mode` 参数
    - `mode` 支持 `native` 和 `openai_compat` 两种模式
    - _需求: 8.1_

  - [x] 3.2 实现原生风格 API 调用方法 `_generate_native`
    - 构造与 Gemini 原生 API 格式一致的请求
    - 向中转站 base_url 发送请求
    - _需求: 8.2_

  - [x] 3.3 实现 OpenAI Chat 兼容接口调用方法 `_generate_openai_compat`
    - 构造 OpenAI Chat Completion 格式请求
    - 从响应中提取 base64 编码图片数据
    - _需求: 8.3_

  - [x] 3.4 实现 base64 图片解码并上传 MinIO 的逻辑
    - 解码 base64 图片数据
    - 上传至 MinIO 存储桶
    - 返回可访问的图片 URL
    - _需求: 8.4_

  - [x] 3.5 实现错误处理逻辑
    - 中转 API 请求失败时抛出包含原始错误信息的 AppError 异常
    - _需求: 8.5_

  - [ ]* 3.6 编写 GeminiProxyProvider 单元测试
    - 测试原生风格 API 调用
    - 测试 OpenAI 兼容接口调用
    - 测试 base64 图片上传逻辑
    - 测试错误处理
    - _需求: 8.1-8.5_

- [x] 4. 重构 AliyunMediaProvider 支持多模型
  - [x] 4.1 添加模型到端点的映射字典 `ENDPOINT_MAP`
    - 图片模型：千问文生图 → `text2image/image-synthesis`
    - 图片模型：万向文生图 v2 → `multimodal-generation/generation`
    - 视频模型：首帧/首尾帧 → `image2video/video-synthesis`
    - 视频模型：参考生视频 → `video-generation/video-synthesis`
    - _需求: 7.1, 7.2, 7.3_

  - [x] 4.2 实现 `_get_endpoint` 方法，根据模型 key 返回正确的 API 端点
    - _需求: 7.1, 7.2, 7.3_

  - [x] 4.3 实现 `_is_video_model` 方法，判断模型是否为视频模型
    - _需求: 7.3_

  - [x] 4.4 重构 `generate` 方法，根据模型类型分发到图片或视频生成逻辑
    - _需求: 7.1, 7.2, 7.3_

  - [x] 4.5 实现视频生成方法 `_generate_video`，支持首帧、首尾帧、参考生视频等输入模式
    - 根据模型的 `input_modes` 能力构造正确的请求 payload
    - _需求: 7.3_

  - [x] 4.6 统一异步任务轮询逻辑
    - 轮询间隔 2 秒，最大等待时间 5 分钟
    - 非 200 状态码时抛出 AppError 异常
    - _需求: 7.4, 7.5_

  - [ ] 4.7 编写 AliyunMediaProvider 单元测试
    - 测试千问文生图模型调用
    - 测试万向文生图 v2 模型调用
    - 测试万向视频各输入模式
    - 测试错误处理
    - _需求: 7.1-7.5_

- [x] 5. 完善 VolcengineVideoProvider 实现
  - [x] 5.1 实现 `_submit_task` 方法，调用火山引擎视频生成任务提交 API
    - 传入模型标识、提示词和参数
    - 返回 task_id
    - _需求: 12.2, 12.3_

  - [x] 5.2 实现 `_query_task` 方法，查询任务状态
    - _需求: 12.3_

  - [x] 5.3 实现 `generate` 方法的完整轮询逻辑
    - 轮询间隔 2 秒，最大等待时间 10 分钟
    - 任务成功时提取视频 URL 返回 MediaResponse
    - _需求: 12.3, 12.4_

  - [x] 5.4 实现错误处理逻辑
    - 任务失败或取消时抛出包含错误详情的 AppError 异常
    - 轮询超时时抛出超时 AppError 异常，HTTP 状态码 504
    - _需求: 12.5, 12.6_

  - [ ]* 5.5 编写 VolcengineVideoProvider 单元测试
    - 测试任务提交
    - 测试轮询逻辑
    - 测试成功响应处理
    - 测试失败和超时处理
    - _需求: 12.1-12.6_

- [x] 6. 检查点 - 确保所有 Provider 实现正确
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 更新 MediaProviderFactory 支持新厂商
  - [x] 7.1 在 `PROVIDER_MAP` 中添加新厂商映射
    - `gemini_proxy` → `GeminiProxyProvider`
    - `aliyun_video` → `AliyunMediaProvider`（复用）
    - `volcengine_video` → `VolcengineVideoProvider`
    - _需求: 9.1, 9.2_

  - [x] 7.2 更新 `get_provider` 方法，支持 base_url 参数传递
    - _需求: 9.1_

  - [x] 7.3 实现未注册厂商的错误处理
    - 抛出包含厂商标识的 AppError 异常，HTTP 状态码 400
    - _需求: 9.3_

  - [ ]* 7.4 编写 MediaProviderFactory 单元测试
    - 测试所有厂商的 Provider 分发
    - 测试未注册厂商的错误处理
    - _需求: 9.1-9.3_

- [x] 8. 新增模型能力查询 API
  - [x] 8.1 在 AIModelService 中实现 `list_with_capabilities` 方法
    - 查询指定 category 的所有已启用模型
    - 按厂商分组返回，包含 `model_capabilities` 信息
    - _需求: 10.1, 10.2_

  - [x] 8.2 创建 API 端点 `GET /api/v1/ai-catalog/models`
    - 支持 `category` 查询参数（image/video）
    - 支持 `enabled_only` 查询参数
    - _需求: 10.1, 10.3, 10.4_

  - [x] 8.3 定义响应 Pydantic 模型
    - 包含模型 code、名称、厂商名称、model_capabilities、param_schema、enabled 状态
    - _需求: 10.2_

  - [ ]* 8.4 编写模型能力查询 API 单元测试
    - 测试图片模型查询
    - 测试视频模型查询
    - 测试响应数据结构
    - _需求: 10.1-10.4_

- [x] 9. 更新 init_ai_catalog 脚本添加模型种子数据
  - [x] 9.1 注册阿里云图片厂商和模型
    - 厂商 code: `aliyun`，provider_class: `AliyunMediaProvider`
    - 模型：千问文生图（qwen-image-max, qwen-image-plus）、Z-Image（z-image-turbo）、万向文生图 v2（wan2.6-t2i, wan2.5-t2i）
    - 为每个模型配置 `model_capabilities`
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 9.2 注册火山引擎图片厂商和模型
    - 厂商 code: `volcengine`，provider_class: `VolcengineMediaProvider`
    - 模型：SeedDream 4.5（doubao-seedream-4-5）、SeedDream 5.0（doubao-seedream-5-0）
    - 为每个模型配置 `model_capabilities`
    - _需求: 3.1, 3.2, 3.3, 3.4_

  - [x] 9.3 注册 Gemini 图片厂商和模型
    - 原生 API 厂商 code: `gemini`，provider_class: `GeminiMediaProvider`
    - 中转 API 厂商 code: `gemini_proxy`，provider_class: `GeminiProxyProvider`
    - 模型：gemini-2.5-flash-image、gemini-3-pro-image-preview、gemini-2.0-flash-exp-image-generation
    - 为每个模型配置 `model_capabilities`
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 9.4 注册阿里云视频厂商和模型
    - 厂商 code: `aliyun`（视频类别），provider_class: `AliyunMediaProvider`
    - 首帧模式模型：wan2.6-i2v、wan2.5-i2v
    - 首尾帧模式模型：wan2.2-kf2v-flash、wanx2.1-kf2v-plus
    - 参考生视频模式模型：wan2.6-r2v、wan2.6-r2v-flash
    - 为每个模型配置 `model_capabilities`，包含 input_modes、resolution_tiers、duration 等
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 9.5 注册火山引擎视频厂商和模型
    - 厂商 code: `volcengine_video`，provider_class: `VolcengineVideoProvider`
    - 模型：Seedance 2.0（seedance-2-0）
    - 配置 `model_capabilities`
    - _需求: 6.1, 6.2_

- [x] 10. 检查点 - 确保种子数据正确
  - 运行 init_ai_catalog 脚本，验证数据写入
  - 确保所有测试通过，如有问题请询问用户

- [x] 11. 前端模型选择器组件
  - [x] 11.1 创建模型能力查询 API 客户端函数
    - 调用 `GET /api/v1/ai-catalog/models` 获取模型列表
    - _需求: 10.1_

  - [x] 11.2 定义 TypeScript 类型接口
    - `ModelCapabilities` 接口：resolutions、aspect_ratios、duration_range、input_modes 等
    - `AIModel` 接口：code、name、model_capabilities、param_schema
    - `Manufacturer` 接口：code、name、models
    - _需求: 11.1, 11.3_

  - [x] 11.3 实现模型选择器组件 `ModelSelector`
    - 按厂商分组展示可用模型
    - 支持 category 属性区分图片/视频模型
    - _需求: 11.1, 11.3_

  - [x] 11.4 实现动态参数表单渲染逻辑
    - 根据 `model_capabilities` 动态展示分辨率、宽高比选项
    - 视频模型额外展示时长、输入模式选项
    - _需求: 11.2, 11.4_

  - [x] 11.5 实现条件渲染逻辑
    - 不支持负向提示词时隐藏输入框
    - 需要参考图输入时显示图片上传区域
    - _需求: 11.5, 11.6_

  - [x] 11.6 集成模型选择器到图片/视频生成页面
    - 替换现有的模型选择逻辑
    - _需求: 11.1-11.6_

  - [ ]* 11.7 编写前端组件测试
    - 测试模型列表渲染
    - 测试参数表单动态渲染
    - 测试条件渲染逻辑
    - _需求: 11.1-11.6_

- [x] 12. 最终检查点 - 确保所有功能正常
  - 确保所有测试通过，如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 进度
- 每个任务都引用了具体的需求条款以便追溯
- 检查点任务用于确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
