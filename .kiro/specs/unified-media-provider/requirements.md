# 需求文档：统一媒体 Provider 体系与模型测试页

## 简介

当前系统存在两套并行的 Provider 工厂体系：旧的 `ProviderFactory`（factory.py）和新的 `MediaProviderFactory`（media_factory.py）。两套体系的 provider 注册不完整，导致部分厂商在某条路径下可用但在另一条路径下报 KeyError。本特性将统一到 `MediaProvider` 体系，消除双工厂并存的问题，完善前端 `ModelSelector` 组件使其能够根据后端 `model_capabilities` JSONB 字段动态渲染所有参数控件，并构建统一的模型测试页面，让用户在一个页面内完成文本、图片、视频三种 AI 能力的测试与结果查看。

## 术语表

- **ProviderFactory**: 旧的 provider 工厂（`factory.py`），按 `_text` / `_image` / `_video` 三个字典分别注册厂商实例
- **MediaProviderFactory**: 新的 provider 工厂（`media_factory.py`），通过统一的 `PROVIDER_MAP` 注册所有媒体厂商类
- **MediaProvider**: 新体系的抽象基类（`base_media.py`），定义统一的 `generate(request)` 接口
- **AIGatewayService**: 服务层（`service.py`），包含 `generate_image()`、`generate_video()`、`generate_media()` 等方法
- **ModelSelector**: 前端模型选择组件，根据 `model_capabilities` 动态渲染参数表单
- **model_capabilities**: 数据库 AIModel 表的 JSONB 字段，存储每个模型的能力参数（分辨率、宽高比、时长等）
- **resolution_tiers**: 分层分辨率数据结构，如 `{"480P": [...], "720P": [...], "1080P": [...]}`
- **duration_options**: 固定时长选项数组，如 `[5, 10]`，与 `duration_range` 互斥
- **input_modes**: 视频输入模式，包括 `text_to_video`、`first_frame`、`first_last_frame`、`reference_to_video`
- **CapabilityParams**: 前端子组件，负责根据 `model_capabilities` 渲染动态参数控件
- **模型测试页**: 统一的 AI 模型测试页面，支持在同一页面内切换文本、图片、视频三种类别进行测试
- **任务进度**: 异步生成任务（图片/视频）的实时状态展示，包括提交中、生成中、已完成、失败等状态
- **测试历史**: 模型测试会话的历史记录，包含每次测试的输入参数和输出结果

## 需求

### 需求 1：统一 Provider 注册表

**用户故事：** 作为后端开发者，我希望所有媒体厂商（图片和视频）都注册在同一个工厂中，以便消除双工厂并存导致的 KeyError 和维护负担。

#### 验收标准

1. THE MediaProviderFactory SHALL 在 `PROVIDER_MAP` 中注册所有当前支持的图片厂商（aliyun、volcengine、doubao、gemini、google、gemini_proxy、kling、openai）
2. THE MediaProviderFactory SHALL 在 `PROVIDER_MAP` 中注册所有当前支持的视频厂商（aliyun、volcengine_video、kling、vidu）
3. WHEN 调用 `get_provider()` 传入任何已注册厂商的 manufacturer 值时，THE MediaProviderFactory SHALL 返回对应的 MediaProvider 实例
4. WHEN 调用 `get_provider()` 传入未注册的 manufacturer 值时，THE MediaProviderFactory SHALL 抛出包含厂商名称的 AppError（code=400）

### 需求 2：旧 Provider 适配迁移

**用户故事：** 作为后端开发者，我希望将旧体系中仅存在于 `ProviderFactory` 的 provider（Kling 图片、Kling 视频、OpenAI 图片）迁移到 `MediaProvider` 接口，以便统一调用方式。

#### 验收标准

1. THE KlingImageAdapter SHALL 实现 MediaProvider 接口，将 `generate(request)` 调用委托给现有的 `KlingImageProvider.generate_image()` 方法
2. THE KlingVideoAdapter SHALL 实现 MediaProvider 接口，将 `generate(request)` 调用委托给现有的 `KlingVideoProvider.generate_video()` 方法
3. THE OpenAIImageAdapter SHALL 实现 MediaProvider 接口，将 `generate(request)` 调用委托给现有的 `OpenAIImageProvider.generate_image()` 方法
4. WHEN 通过适配器调用旧 provider 时，THE Adapter SHALL 将 `MediaRequest` 的字段正确映射到旧 provider 的参数格式
5. WHEN 旧 provider 返回结果时，THE Adapter SHALL 将返回值封装为 `MediaResponse` 格式

### 需求 3：统一服务层入口

**用户故事：** 作为后端开发者，我希望服务层只通过 `generate_media()` 一个入口处理所有图片和视频生成请求，以便简化调用路径和减少重复代码。

#### 验收标准

1. THE AIGatewayService SHALL 通过 `generate_media()` 方法处理所有图片类别的生成请求
2. THE AIGatewayService SHALL 通过 `generate_media()` 方法处理所有视频类别的生成请求
3. WHEN `generate_media()` 被调用时，THE AIGatewayService SHALL 仅使用 MediaProviderFactory 获取 provider 实例
4. WHEN 迁移完成后，THE AIGatewayService SHALL 移除 `generate_image()` 和 `generate_video()` 方法
5. WHEN 迁移完成后，THE ProviderFactory SHALL 仅保留 `_text` 字典和 `get_text_provider()` 方法，移除 `_image` 和 `_video` 相关代码

### 需求 4：API 路由迁移

**用户故事：** 作为后端开发者，我希望所有图片和视频生成的 API 路由都调用统一的 `generate_media()` 方法，以便与新的服务层入口保持一致。

#### 验收标准

1. WHEN 图片生成 API 端点收到请求时，THE API_Router SHALL 调用 `ai_gateway_service.generate_media(category="image", ...)`
2. WHEN 视频生成 API 端点收到请求时，THE API_Router SHALL 调用 `ai_gateway_service.generate_media(category="video", ...)`
3. WHEN API 路由迁移完成后，THE API_Router SHALL 保持与现有前端请求格式的向后兼容性

### 需求 5：前端 ModelCapabilities 类型完善

**用户故事：** 作为前端开发者，我希望 `ModelCapabilities` 类型定义覆盖后端 `model_capabilities` 的所有字段，以便获得完整的类型安全。

#### 验收标准

1. THE ModelCapabilities 接口 SHALL 包含 `resolution_tiers` 字段（类型为 `Record<string, string[]>`），用于表示分层分辨率选项
2. THE ModelCapabilities 接口 SHALL 包含 `duration_options` 字段（类型为 `number[]`），用于表示固定时长选项
3. THE ModelCapabilities 接口 SHALL 包含 `pixel_range` 字段（类型为 `{min: number, max: number}`），用于表示像素数约束
4. THE ModelCapabilities 接口 SHALL 包含 `aspect_ratio_range` 字段（类型为 `{min: number, max: number}`），用于表示数值宽高比范围
5. THE ModelCapabilities 接口 SHALL 包含 `max_output_images` 字段（类型为 `number`），用于表示批量生成数量
6. THE ModelCapabilities 接口 SHALL 包含 `supports_prompt_extend` 字段（类型为 `boolean`）
7. THE ModelCapabilities 接口 SHALL 包含 `supports_watermark` 字段（类型为 `boolean`）
8. THE ModelCapabilities 接口 SHALL 包含 `supports_seed` 字段（类型为 `boolean`）
9. THE ModelCapabilities 接口 SHALL 包含 `max_reference_images` 字段（类型为 `number`）
10. THE ModelCapabilities 接口 SHALL 包含 `special_features` 字段（类型为 `string[]`）

### 需求 6：分层分辨率选择器渲染

**用户故事：** 作为用户，我希望在选择模型后看到分层的分辨率选择器（先选清晰度档位如 480P/720P/1080P，再选具体分辨率），以便直观地选择输出质量。

#### 验收标准

1. WHEN 模型的 `model_capabilities` 包含 `resolution_tiers` 字段时，THE CapabilityParams SHALL 渲染一个两级联动选择器
2. WHEN 用户选择清晰度档位（如 "720P"）时，THE CapabilityParams SHALL 更新第二级下拉框显示该档位下的具体分辨率列表
3. WHEN 模型的 `model_capabilities` 同时包含 `resolutions`（扁平数组）时，THE CapabilityParams SHALL 渲染单级分辨率下拉框
4. WHEN 模型的 `model_capabilities` 既无 `resolution_tiers` 也无 `resolutions` 时，THE CapabilityParams SHALL 隐藏分辨率选择器
5. WHEN 清晰度档位切换时，THE CapabilityParams SHALL 自动选中新档位的第一个分辨率作为默认值

### 需求 7：固定时长选项渲染

**用户故事：** 作为用户，我希望当模型只支持固定时长选项时看到按钮组而非滑块，以便准确选择支持的时长。

#### 验收标准

1. WHEN 模型的 `model_capabilities` 包含 `duration_options` 字段时，THE CapabilityParams SHALL 渲染时长按钮组（如 "5s"、"10s"）
2. WHEN 模型的 `model_capabilities` 包含 `duration_range` 字段时，THE CapabilityParams SHALL 渲染时长滑块
3. WHEN 模型的 `model_capabilities` 同时包含 `duration_options` 和 `duration_range` 时，THE CapabilityParams SHALL 优先渲染 `duration_options` 按钮组
4. WHEN 模型的 `model_capabilities` 既无 `duration_options` 也无 `duration_range` 时，THE CapabilityParams SHALL 隐藏时长控件

### 需求 8：布尔开关类能力渲染

**用户故事：** 作为用户，我希望看到模型支持的可选功能开关（如提示词扩展、水印、种子值），以便按需启用这些功能。

#### 验收标准

1. WHEN 模型的 `model_capabilities` 中 `supports_prompt_extend` 为 true 时，THE CapabilityParams SHALL 渲染"提示词扩展"开关
2. WHEN 模型的 `model_capabilities` 中 `supports_watermark` 为 true 时，THE CapabilityParams SHALL 渲染"添加水印"开关
3. WHEN 模型的 `model_capabilities` 中 `supports_seed` 为 true 时，THE CapabilityParams SHALL 渲染"种子值"数字输入框
4. WHEN 用户切换开关或输入种子值时，THE CapabilityParams SHALL 通过 `onParamsChange` 回调将参数变更通知父组件

### 需求 9：动态参考图片上传

**用户故事：** 作为用户，我希望参考图片上传区域根据所选输入模式动态调整（首帧模式上传 1 张、首尾帧模式上传 2 张、参考生视频模式上传多张），以便清楚知道需要上传多少张图片。

#### 验收标准

1. WHEN 用户选择 `first_frame` 输入模式时，THE ModelSelector SHALL 显示单张图片上传区域，标签为"首帧图片"
2. WHEN 用户选择 `first_last_frame` 输入模式时，THE ModelSelector SHALL 显示两个图片上传区域，标签分别为"首帧图片"和"尾帧图片"
3. WHEN 用户选择 `reference_to_video` 输入模式时，THE ModelSelector SHALL 显示多图上传区域，上传数量上限由 `max_reference_images` 字段决定
4. WHEN 用户选择 `text_to_video` 输入模式时，THE ModelSelector SHALL 隐藏图片上传区域
5. WHEN `max_reference_images` 字段存在时，THE ModelSelector SHALL 在上传区域显示"最多 N 张"的提示文本
6. WHEN 用户切换输入模式时，THE ModelSelector SHALL 清空已上传的图片状态

### 需求 10：批量生成数量控件

**用户故事：** 作为用户，我希望在支持批量生成的图片模型上设置生成数量，以便一次获得多张图片。

#### 验收标准

1. WHEN 模型的 `model_capabilities` 中 `max_output_images` 大于 1 时，THE CapabilityParams SHALL 渲染"生成数量"数字输入框
2. THE 数字输入框 SHALL 限制输入范围为 1 到 `max_output_images` 之间的整数
3. WHEN `max_output_images` 不存在或等于 1 时，THE CapabilityParams SHALL 隐藏生成数量控件

### 需求 11：特殊功能标签展示

**用户故事：** 作为用户，我希望在模型选择后看到该模型支持的特殊功能标签（如文字渲染、多主体一致性等），以便了解模型的独特能力。

#### 验收标准

1. WHEN 模型的 `model_capabilities` 包含 `special_features` 数组且非空时，THE CapabilityParams SHALL 以标签（Badge）形式展示每个特殊功能
2. WHEN `special_features` 为空或不存在时，THE CapabilityParams SHALL 隐藏特殊功能区域


### 需求 12：统一模型测试页面

**用户故事：** 作为用户，我希望在一个统一的模型测试页面中切换文本、图片、视频三种 AI 类别进行测试，以便在同一个工作流中验证所有类型的模型配置。

#### 验收标准

1. THE 模型测试页 SHALL 提供"文本"、"图片"、"视频"三个类别 Tab 切换
2. WHEN 用户切换类别 Tab 时，THE 模型测试页 SHALL 加载该类别下所有已启用的模型配置供选择
3. WHEN 用户选择"文本"类别时，THE 模型测试页 SHALL 显示聊天对话界面，支持流式输出
4. WHEN 用户选择"图片"类别时，THE 模型测试页 SHALL 显示 ModelSelector 组件（含能力驱动的动态参数表单）和图片预览区域
5. WHEN 用户选择"视频"类别时，THE 模型测试页 SHALL 显示 ModelSelector 组件（含能力驱动的动态参数表单）和视频预览区域
6. THE 模型测试页 SHALL 在图片和视频类别中复用需求 6-11 中定义的 CapabilityParams 动态渲染逻辑

### 需求 13：图片测试结果展示

**用户故事：** 作为用户，我希望在图片测试完成后看到生成的图片、使用的参数和耗时信息，以便评估模型效果。

#### 验收标准

1. WHEN 图片生成请求提交后，THE 模型测试页 SHALL 在预览区域显示加载状态（如 spinner 和"生成中..."文案）
2. WHEN 图片生成成功时，THE 模型测试页 SHALL 在预览区域展示生成的图片，支持点击放大查看
3. WHEN 图片生成成功时，THE 模型测试页 SHALL 在图片下方显示元信息（usage_id、积分消耗、生成耗时）
4. WHEN 图片生成失败时，THE 模型测试页 SHALL 显示友好的错误信息，包含错误码和错误描述
5. THE 模型测试页 SHALL 保留当前会话内的历史生成结果列表，用户可以上下滚动查看

### 需求 14：视频测试结果与任务进度展示

**用户故事：** 作为用户，我希望在视频测试中看到任务的实时进度（因为视频生成通常需要几分钟），以便了解当前状态而不是面对空白等待。

#### 验收标准

1. WHEN 视频生成请求提交后，THE 模型测试页 SHALL 显示任务状态指示器，包含以下状态：提交中 → 排队中 → 生成中 → 已完成/失败
2. WHEN 视频任务处于"生成中"状态时，THE 模型测试页 SHALL 显示已等待时长的计时器
3. WHEN 视频生成成功时，THE 模型测试页 SHALL 在预览区域内嵌播放器播放生成的视频，支持播放/暂停/循环
4. WHEN 视频生成成功时，THE 模型测试页 SHALL 显示视频元信息（时长、分辨率、usage_id、积分消耗）
5. WHEN 视频生成失败时，THE 模型测试页 SHALL 显示友好的错误信息和失败原因
6. THE 模型测试页 SHALL 保留当前会话内的历史视频生成结果列表

### 需求 15：文本测试对话界面

**用户故事：** 作为用户，我希望在文本测试中拥有完整的聊天对话体验（流式输出、多轮对话），以便充分测试文本模型的能力。

#### 验收标准

1. WHEN 用户发送消息时，THE 模型测试页 SHALL 以流式方式逐字显示模型的回复内容
2. THE 模型测试页 SHALL 支持多轮对话，保持上下文连续性
3. THE 模型测试页 SHALL 提供"清空对话"按钮，重置当前对话历史
4. WHEN 模型正在回复时，THE 模型测试页 SHALL 显示"停止生成"按钮，允许用户中断流式输出
5. WHEN 文本模型支持图片输入（`supports_image` 为 true）时，THE 模型测试页 SHALL 允许用户在消息中附加图片

### 需求 16：测试历史记录管理

**用户故事：** 作为用户，我希望能够查看和管理模型测试的历史记录，以便回顾之前的测试结果和对比不同模型的效果。

#### 验收标准

1. THE 模型测试页 SHALL 在侧边栏显示当前模型配置的测试会话历史列表
2. WHEN 用户点击历史会话时，THE 模型测试页 SHALL 加载该会话的完整内容（文本对话记录 / 图片生成结果 / 视频生成结果）
3. THE 历史列表 SHALL 显示每个会话的创建时间和运行次数
4. THE 模型测试页 SHALL 提供"新建会话"按钮，创建新的空白测试会话
