# 需求文档：多厂商媒体生成模型集成

## 简介

本功能旨在扩展言之有理（AnyReason）平台的 AI 媒体生成能力，集成多个厂商的图片和视频生成模型 API。核心目标包括：

1. 将阿里云（千问文生图、Z-Image、万向文生图 v2、万向图生视频系列）、火山引擎（豆包 SeedDream 4.5 文生图、火山视频生成）、Google Gemini（原生 API 及中转 API）等厂商的图片和视频生成模型统一接入系统
2. 优化数据库模型，将各厂商模型的能力限制（支持的分辨率、宽高比、时长、输入模式等）结构化存储
3. 在前端为用户提供模型选择和参数配置界面，根据所选模型动态展示可用参数选项

## 术语表

- **AI_Catalog_Service**：AI 目录服务，管理厂商（AIManufacturer）和模型（AIModel）的 CRUD 操作
- **AIManufacturer**：AI 厂商实体，存储厂商标识、名称、类别、Provider 类名等信息
- **AIModel**：AI 模型实体，存储模型标识、名称、能力参数等信息，关联到 AIManufacturer
- **AIModelConfig**：AI 模型配置实体，存储用户配置的厂商+模型+API Key+Base URL 等运行时凭证
- **MediaProvider**：媒体生成提供者，抽象基类，定义 `generate` 方法接口
- **MediaProviderFactory**：媒体提供者工厂，根据厂商标识分发到具体 Provider 实现
- **param_schema**：参数模式，AIModel 表中的 JSONB 字段，以 JSON Schema 格式描述模型接受的动态参数
- **model_capabilities**：模型能力描述，JSONB 字段，存储模型支持的分辨率列表、宽高比列表、时长范围、输入模式等结构化能力信息
- **MediaRequest**：媒体生成请求 Pydantic 模型，包含 model_key、prompt、negative_prompt、param_json 等字段
- **MediaResponse**：媒体生成响应 Pydantic 模型，包含 url、duration、cost、usage_id、meta 等字段
- **init_ai_catalog**：AI 目录初始化脚本，用于向数据库写入厂商和模型种子数据
- **AliyunMediaProvider**：阿里云媒体提供者，处理阿里云 DashScope API 的异步任务提交与轮询
- **VolcengineMediaProvider**：火山引擎媒体提供者，通过 AsyncArk SDK 调用火山引擎图片生成 API
- **VolcengineVideoProvider**：火山引擎视频提供者，调用火山引擎视频生成 API
- **GeminiMediaProvider**：Gemini 媒体提供者，调用 Google Gemini 原生 API 生成图片
- **GeminiProxyProvider**：Gemini 中转 API 提供者，通过第三方中转站调用 Gemini 生图能力（原生接口或 OpenAI 兼容接口）
- **前端模型选择器**：前端 UI 组件，展示可用模型列表及其能力参数，供用户选择和配置

## 需求

### 需求 1：扩展 AIModel 数据模型以存储模型能力信息

**用户故事：** 作为系统管理员，我希望数据库能结构化存储每个图片/视频模型的能力限制（分辨率、宽高比、时长等），以便前端能动态展示可用参数选项。

#### 验收标准

1. THE AIModel 表 SHALL 包含 `model_capabilities` JSONB 字段，用于存储模型的能力描述信息
2. WHEN `model_capabilities` 字段存储图片模型能力时，THE AIModel 实体 SHALL 包含以下结构化信息：支持的分辨率列表（如 `["1024x1024", "1280x720"]`）、支持的宽高比列表（如 `["1:1", "16:9", "9:16"]`）、是否支持负向提示词、是否支持参考图输入、最大输出图片数量
3. WHEN `model_capabilities` 字段存储视频模型能力时，THE AIModel 实体 SHALL 包含以下结构化信息：支持的分辨率列表、支持的宽高比列表、支持的时长选项（如 `[5, 10]` 秒）、输入模式列表（如 `["text_to_video", "first_frame", "first_last_frame", "video_to_video"]`）、是否支持参考图输入、最大输入图片数量
4. THE AIModel 表 SHALL 保留现有 `param_schema` JSONB 字段，用于存储模型接受的 API 调用参数的 JSON Schema 定义
5. THE AIModel 表 SHALL 包含 `category` 字段（值为 `text`、`image` 或 `video`），以便在模型级别区分类别，而非仅依赖厂商级别的 category

### 需求 2：注册阿里云图片生成模型厂商和模型

**用户故事：** 作为系统管理员，我希望系统预置阿里云图片生成模型的厂商和模型信息，以便用户能选择阿里云的图片生成服务。

#### 验收标准

1. THE init_ai_catalog 脚本 SHALL 在 IMAGE_MANUFACTURERS 中注册阿里云图片厂商，code 为 `aliyun`，provider_class 为 `AliyunMediaProvider`
2. THE init_ai_catalog 脚本 SHALL 注册以下阿里云图片模型：
   - 千问文生图模型（`qwen-max-vl`、`qwen-image-max`、`qwen-image-plus`）
   - Z-Image 文生图模型（`z-image-turbo`）
   - 万向文生图 v2 模型（`wan2.6-t2i`、`wan2.5-t2i`、`wan2.2-t2i`）
3. WHEN 注册千问文生图模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - 支持的分辨率：`["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"]`
   - 支持的宽高比：`["16:9", "4:3", "1:1", "3:4", "9:16"]`
   - 支持参数：`negative_prompt`、`prompt_extend`、`watermark`、`seed`
   - API 端点：`text2image/image-synthesis`
4. WHEN 注册万向文生图 v2 模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - wan2.6 总像素范围：1280x1280 到 1440x1440，宽高比 1:4 到 4:1
   - 支持参数：`n`（1-4张）、`negative_prompt`、`prompt_extend`、`watermark`、`seed`
   - API 端点：`multimodal-generation/generation`
5. WHEN 注册 Z-Image 文生图模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - 总像素范围：512x512 到 2048x2048
   - 推荐范围：1024x1024 到 1536x1536
   - 支持参数：`prompt_extend`（影响费用）、`seed`

### 需求 3：注册火山引擎（豆包）图片生成模型

**用户故事：** 作为系统管理员，我希望系统预置火山引擎 SeedDream 图片生成模型信息，以便用户能选择豆包的图片生成服务。

#### 验收标准

1. THE init_ai_catalog 脚本 SHALL 确保 IMAGE_MANUFACTURERS 中已注册火山引擎图片厂商（code 为 `volcengine`），provider_class 为 `VolcengineMediaProvider`
2. THE init_ai_catalog 脚本 SHALL 注册以下 SeedDream 模型：
   - SeedDream 4.5（`doubao-seedream-4-5`）
   - SeedDream 5.0（`doubao-seedream-5-0`）
3. WHEN 注册 SeedDream 模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - 分辨率档位：`["2K", "4K"]`
   - 精确分辨率示例：`["2048x2048", "2560x1440", "1728x2304"]`
   - 总像素范围：3686400 到 16777216
   - 宽高比范围：1:16 到 16:1
   - 支持功能：文本渲染（英文）、多主体一致性、图生图（最多14张参考图）
   - SeedDream 5.0 新增：Web 搜索、多轮图文编辑
4. WHEN SeedDream 模型被调用时，THE VolcengineMediaProvider SHALL 通过 AsyncArk SDK 的 `images.generate` 接口发送请求，并正确处理 `url` 和 `b64_json` 两种响应格式

### 需求 4：注册 Gemini 图片生成模型（含中转 API）

**用户故事：** 作为系统管理员，我希望系统支持 Google Gemini 图片生成模型，包括原生 API 和中转 API 两种接入方式，以便用户根据网络环境灵活选择。

#### 验收标准

1. THE init_ai_catalog 脚本 SHALL 在 IMAGE_MANUFACTURERS 中注册 Gemini 图片厂商（code 为 `gemini`），provider_class 为 `GeminiMediaProvider`
2. THE init_ai_catalog 脚本 SHALL 注册以下 Gemini 图片模型：
   - `gemini-2.5-flash-image`
   - `gemini-3-pro-image-preview`
3. WHEN 注册 Gemini 图片模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - 支持的宽高比：`["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]`
   - 分辨率档位：`["1K", "2K", "4K"]`（4K 仅 gemini-3-pro 支持）
   - 支持功能：多图输入（最多14张）、Google Search grounding、Thinking 模式
   - API 端点：`generateContent`
4. THE init_ai_catalog 脚本 SHALL 在 IMAGE_MANUFACTURERS 中注册 Gemini 中转 API 厂商（code 为 `gemini_proxy`），provider_class 为 `GeminiProxyProvider`
5. WHEN 用户选择 Gemini 中转 API 厂商时，THE GeminiProxyProvider SHALL 支持两种调用模式：
   - 原生风格 API：与 Gemini 原生 API 格式一致
   - OpenAI Chat 兼容接口：使用模型 `gemini-2.0-flash-exp-image-generation`，返回 base64 编码图片
6. WHEN Gemini 中转 API 返回 base64 编码图片时，THE GeminiProxyProvider SHALL 将图片解码并上传至 MinIO 存储，返回可访问的 URL

### 需求 5：注册阿里云万向视频生成模型

**用户故事：** 作为系统管理员，我希望系统预置阿里云万向视频生成模型信息，以便用户能使用万向的多种视频生成模式。

#### 验收标准

1. THE init_ai_catalog 脚本 SHALL 在 VIDEO_MANUFACTURERS 中注册阿里云视频厂商（code 为 `aliyun`），provider_class 为 `AliyunMediaProvider`
2. THE init_ai_catalog 脚本 SHALL 注册以下万向视频模型：
   - 首帧模式（`wan2.6-i2v`、`wan2.5-i2v`）
   - 首尾帧模式（`wan2.2-kf2v-flash`、`wanx2.1-kf2v-plus`）
   - 参考生视频模式（`wan2.6-r2v`、`wan2.6-r2v-flash`）
3. WHEN 注册首帧模式模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - `input_modes`: `["first_frame"]`
   - 分辨率档位：`["480P", "720P", "1080P"]`
   - 720P 分辨率：`["1280x720", "720x1280", "960x960", "1088x832", "832x1088"]`
   - 1080P 分辨率：`["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"]`
   - 时长：wan2.6 支持 2-15秒，wan2.5 支持 5/10秒
   - 支持参数：`audio_url`、`shot_type`、`template`、`negative_prompt`、`prompt_extend`、`watermark`、`seed`
   - API 端点：`image2video/video-synthesis`
4. WHEN 注册首尾帧模式模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - `input_modes`: `["first_last_frame"]`
   - 分辨率档位：`["480P", "720P", "1080P"]`（wan2.2-kf2v-flash）；`["720P"]`（wanx2.1-kf2v-plus）
   - 时长：固定5秒
   - 支持参数：`negative_prompt`、`prompt_extend`、`watermark`、`seed`、`template`
   - API 端点：`image2video/video-synthesis`
5. WHEN 注册参考生视频模式模型时，THE init_ai_catalog 脚本 SHALL 在 `model_capabilities` 中记录：
   - `input_modes`: `["reference_to_video"]`
   - 分辨率档位：`["720P", "1080P"]`
   - 720P 分辨率：`["1280x720", "720x1280", "960x960", "1088x832", "832x1088"]`
   - 1080P 分辨率：`["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"]`
   - 时长：2-10秒
   - 参考输入：图像0-5张 + 视频0-3个，总数≤5
   - 支持参数：`shot_type`（single/multi 多镜头叙事）、`audio`（有声/无声）、`watermark`、`seed`
   - API 端点：`video-generation/video-synthesis`
6. THE AliyunMediaProvider SHALL 根据模型的 `input_modes` 能力，构造正确的 API 请求 payload（区分文生视频、首帧、首尾帧、参考视频等不同端点）

### 需求 6：注册火山引擎视频生成模型

**用户故事：** 作为系统管理员，我希望系统预置火山引擎视频生成模型信息，以便用户能使用火山引擎的视频生成服务。

#### 验收标准

1. THE init_ai_catalog 脚本 SHALL 在 VIDEO_MANUFACTURERS 中注册火山引擎视频厂商（code 为 `volcengine_video`），provider_class 为 `VolcengineVideoProvider`
2. THE init_ai_catalog 脚本 SHALL 注册 Seedance 2.0 视频模型（`seedance-2-0`），并在 `model_capabilities` 中记录：
   - 分辨率：原生2K
   - 支持功能：多镜头叙事、0-5张参考图输入、视频补全（15秒内）、多语言唇形同步（8+语言）
   - 生成速度：比1.5 Pro快10倍
   - API 模式：异步任务模式
3. WHEN 火山引擎视频生成任务被提交时，THE VolcengineVideoProvider SHALL 调用火山引擎视频生成 API 提交任务，并返回 task_id
4. WHEN 火山引擎视频任务提交后，THE VolcengineVideoProvider SHALL 通过轮询查询任务状态 API 获取生成结果
5. IF 火山引擎视频任务失败或超时，THEN THE VolcengineVideoProvider SHALL 返回包含错误信息的响应，并触发积分退款流程

### 需求 7：实现 AliyunMediaProvider 对多模型的统一支持

**用户故事：** 作为开发者，我希望 AliyunMediaProvider 能根据不同的阿里云模型（千问文生图、Z-Image、万向文生图、万向视频系列）自动选择正确的 API 端点和请求格式。

#### 验收标准

1. WHEN AliyunMediaProvider 收到千问文生图模型请求时，THE AliyunMediaProvider SHALL 调用 DashScope 的 `text2image/image-synthesis` 端点
2. WHEN AliyunMediaProvider 收到万向文生图 v2 模型请求时，THE AliyunMediaProvider SHALL 调用 DashScope 的 `multimodal-generation/generation` 端点
3. WHEN AliyunMediaProvider 收到万向视频模型请求时，THE AliyunMediaProvider SHALL 根据模型的 `input_modes` 能力选择正确的视频生成端点（首帧、首尾帧、参考视频）
4. THE AliyunMediaProvider SHALL 对所有阿里云异步任务统一实现提交-轮询模式，轮询间隔为 2 秒，最大等待时间为 5 分钟
5. IF 阿里云 API 返回非 200 状态码，THEN THE AliyunMediaProvider SHALL 抛出包含原始错误信息的 AppError 异常

### 需求 8：实现 GeminiProxyProvider 中转 API 提供者

**用户故事：** 作为开发者，我希望系统支持通过第三方中转站调用 Gemini 图片生成能力，以便在无法直接访问 Google API 的网络环境下使用 Gemini 模型。

#### 验收标准

1. THE GeminiProxyProvider SHALL 实现 MediaProvider 抽象基类的 `generate` 方法
2. WHEN GeminiProxyProvider 使用原生风格 API 时，THE GeminiProxyProvider SHALL 向中转站发送与 Gemini 原生 API 格式一致的请求
3. WHEN GeminiProxyProvider 使用 OpenAI Chat 兼容接口时，THE GeminiProxyProvider SHALL 构造 OpenAI Chat Completion 格式的请求，并从响应中提取 base64 编码的图片数据
4. WHEN 中转 API 返回 base64 编码图片时，THE GeminiProxyProvider SHALL 将图片解码并上传至 MinIO 存储桶，返回可访问的图片 URL
5. IF 中转 API 请求失败，THEN THE GeminiProxyProvider SHALL 抛出包含原始错误信息的 AppError 异常

### 需求 9：扩展 MediaProviderFactory 支持新厂商

**用户故事：** 作为开发者，我希望 MediaProviderFactory 能自动识别并分发到所有新注册的厂商 Provider，无需硬编码每个厂商的映射关系。

#### 验收标准

1. THE MediaProviderFactory SHALL 支持以下图片厂商的 Provider 分发：`aliyun`→AliyunMediaProvider、`volcengine`/`doubao`→VolcengineMediaProvider、`gemini`→GeminiMediaProvider、`gemini_proxy`→GeminiProxyProvider
2. THE MediaProviderFactory SHALL 支持以下视频厂商的 Provider 分发：`aliyun`→AliyunMediaProvider、`volcengine_video`→VolcengineVideoProvider、`vidu`→ViduMediaProvider
3. IF MediaProviderFactory 收到未注册的厂商标识，THEN THE MediaProviderFactory SHALL 抛出包含厂商标识的 AppError 异常，HTTP 状态码为 400

### 需求 10：前端模型能力查询 API

**用户故事：** 作为前端开发者，我希望有一个 API 端点能返回指定类别（image/video）下所有可用模型及其能力信息，以便前端动态渲染模型选择器和参数配置表单。

#### 验收标准

1. THE AI_Catalog_Service SHALL 提供一个查询接口，WHEN 前端请求指定 category 的模型列表时，返回该类别下所有已启用的厂商及其模型列表，包含 `model_capabilities` 信息
2. THE 查询接口返回的每个模型 SHALL 包含以下信息：模型 code、模型名称、所属厂商名称、`model_capabilities`（能力描述）、`param_schema`（参数模式）、enabled 状态
3. WHEN 前端请求 `category=image` 时，THE 查询接口 SHALL 返回所有已启用的图片生成模型，每个模型包含支持的分辨率列表和宽高比列表
4. WHEN 前端请求 `category=video` 时，THE 查询接口 SHALL 返回所有已启用的视频生成模型，每个模型包含支持的分辨率列表、时长选项和输入模式列表

### 需求 11：前端模型选择与参数配置 UI

**用户故事：** 作为创作者，我希望在生成图片或视频时能看到所有可用模型，并根据所选模型的能力限制选择分辨率、宽高比等参数。

#### 验收标准

1. WHEN 用户进入图片生成界面时，THE 前端模型选择器 SHALL 展示所有已启用的图片生成模型，按厂商分组显示
2. WHEN 用户选择一个图片模型后，THE 前端模型选择器 SHALL 根据该模型的 `model_capabilities` 动态展示可选的分辨率和宽高比选项
3. WHEN 用户进入视频生成界面时，THE 前端模型选择器 SHALL 展示所有已启用的视频生成模型，按厂商分组显示
4. WHEN 用户选择一个视频模型后，THE 前端模型选择器 SHALL 根据该模型的 `model_capabilities` 动态展示可选的分辨率、时长和输入模式选项
5. IF 用户选择的模型不支持负向提示词，THEN THE 前端模型选择器 SHALL 隐藏负向提示词输入框
6. IF 用户选择的模型要求参考图输入（如首帧模式），THEN THE 前端模型选择器 SHALL 显示图片上传区域，并标注所需图片数量

### 需求 12：VolcengineVideoProvider 完整实现

**用户故事：** 作为开发者，我希望 VolcengineVideoProvider 能完整实现火山引擎视频生成的任务提交、状态查询和结果获取流程。

#### 验收标准

1. THE VolcengineVideoProvider SHALL 实现 MediaProvider 抽象基类的 `generate` 方法
2. WHEN VolcengineVideoProvider 收到视频生成请求时，THE VolcengineVideoProvider SHALL 调用火山引擎视频生成任务提交 API，传入模型标识、提示词和参数
3. WHEN 视频生成任务提交成功后，THE VolcengineVideoProvider SHALL 通过轮询查询任务 API 获取任务状态，轮询间隔为 2 秒，最大等待时间为 10 分钟
4. WHEN 任务状态为成功时，THE VolcengineVideoProvider SHALL 从响应中提取视频 URL 并返回 MediaResponse
5. IF 任务状态为失败或取消，THEN THE VolcengineVideoProvider SHALL 抛出包含错误详情的 AppError 异常
6. IF 轮询超时，THEN THE VolcengineVideoProvider SHALL 抛出超时 AppError 异常，HTTP 状态码为 504
