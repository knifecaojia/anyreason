# 实施计划：统一媒体 Provider 体系与模型测试页

## 概述

按照渐进式迁移策略实施：先创建适配器并注册到统一工厂，再收敛服务层和 API 路由，然后完善前端类型和动态渲染组件，最后构建统一模型测试页面。每个阶段可独立验证，降低迁移风险。

## Tasks

- [x] 1. 创建适配器并注册到统一工厂
  - [x] 1.1 创建 KlingImageAdapter 适配器
    - 在 `fastapi_backend/app/ai_gateway/providers/adapters/` 目录下创建 `kling_image_adapter.py`
    - 实现 `MediaProvider` 接口，将 `generate(request)` 委托给 `KlingImageProvider.generate_image()`
    - 从 `MediaRequest.param_json` 中提取 `resolution`、`image_data_urls` 等字段映射到旧 provider 参数格式
    - 将旧 provider 返回值封装为 `MediaResponse`
    - _Requirements: 2.1, 2.4, 2.5_

  - [x] 1.2 创建 KlingVideoAdapter 适配器
    - 在 `fastapi_backend/app/ai_gateway/providers/adapters/` 目录下创建 `kling_video_adapter.py`
    - 实现 `MediaProvider` 接口，将 `generate(request)` 委托给 `KlingVideoProvider.generate_video()`
    - 从 `MediaRequest.param_json` 中提取 `duration`、`aspect_ratio`、`image_data_urls` 等字段
    - 将旧 provider 返回值封装为 `MediaResponse`
    - _Requirements: 2.2, 2.4, 2.5_

  - [x] 1.3 创建 OpenAIImageAdapter 适配器
    - 在 `fastapi_backend/app/ai_gateway/providers/adapters/` 目录下创建 `openai_image_adapter.py`
    - 实现 `MediaProvider` 接口，将 `generate(request)` 委托给 `OpenAIImageProvider.generate_image()`
    - 从 `MediaRequest.param_json` 中提取 `resolution` 等字段映射到旧 provider 参数格式
    - 将旧 provider 返回值封装为 `MediaResponse`
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 1.4 创建适配器目录 `__init__.py` 并导出所有适配器
    - 创建 `fastapi_backend/app/ai_gateway/providers/adapters/__init__.py`
    - 导出 `KlingImageAdapter`、`KlingVideoAdapter`、`OpenAIImageAdapter`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.5 将所有厂商注册到 MediaProviderFactory 的 PROVIDER_MAP
    - 修改 `fastapi_backend/app/ai_gateway/providers/media_factory.py`
    - 在 `PROVIDER_MAP` 中添加 `kling`（KlingImageAdapter）、`openai`（OpenAIImageAdapter）、`kling_video`（KlingVideoAdapter）等缺失的厂商
    - 确保所有图片厂商（aliyun、volcengine、doubao、gemini、google、gemini_proxy、kling、openai）和视频厂商（aliyun、volcengine_video、kling、vidu）均已注册
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.6 编写适配器单元测试
    - 在 `fastapi_backend/tests/` 下创建适配器测试文件
    - Mock 旧 provider，验证参数传递和响应封装
    - 验证 `PROVIDER_MAP` 包含所有预期厂商 key
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [x] 1.7 编写属性测试：已注册厂商返回有效 Provider 实例
    - **Property 1: 已注册厂商返回有效 Provider 实例**
    - **Validates: Requirements 1.3**

  - [x] 1.8 编写属性测试：未注册厂商抛出 AppError
    - **Property 2: 未注册厂商抛出 AppError**
    - **Validates: Requirements 1.4**

  - [x] 1.9 编写属性测试：适配器字段映射与响应封装
    - **Property 3: 适配器字段映射与响应封装**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 2. 统一服务层与 API 路由迁移
  - [x] 2.1 服务层收敛到 generate_media() 单一入口
    - 修改 `fastapi_backend/app/ai_gateway/service.py`
    - 确保 `generate_media()` 方法使用 `MediaProviderFactory` 处理所有图片和视频请求
    - 将 `generate_image()` 和 `generate_video()` 标记为 deprecated，内部转发到 `generate_media()`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 API 路由迁移到 generate_media()
    - 修改 `fastapi_backend/app/api/v1/ai_media.py`
    - 将图片生成端点改为调用 `ai_gateway_service.generate_media(category="image", ...)`
    - 将视频生成端点改为调用 `ai_gateway_service.generate_media(category="video", ...)`
    - 保持与现有前端请求格式的向后兼容性
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.3 清理旧代码
    - 移除 `generate_image()` 和 `generate_video()` 方法
    - 修改 `fastapi_backend/app/ai_gateway/factory.py`，移除 `_image` 和 `_video` 字典，仅保留 `_text` 和 `get_text_provider()`
    - _Requirements: 3.4, 3.5_

  - [x] 2.4 编写服务层和 API 路由单元测试
    - 测试 `generate_media()` 对 image/video 类别的路由
    - 测试 API 路由迁移后的请求/响应格式
    - _Requirements: 3.1, 3.2, 4.1, 4.2_

  - [x] 2.5 编写属性测试：API 向后兼容性
    - **Property 4: API 向后兼容性**
    - **Validates: Requirements 4.3**

- [x] 3. Checkpoint - 后端迁移验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 前端 ModelCapabilities 类型完善与 CapabilityParams 增强
  - [x] 4.1 扩展 ModelCapabilities 接口
    - 修改 `nextjs-frontend/lib/aistudio/types.ts`
    - 添加 `resolution_tiers`、`duration_options`、`pixel_range`、`aspect_ratio_range`、`max_output_images`、`supports_prompt_extend`、`supports_watermark`、`supports_seed`、`max_reference_images`、`special_features` 字段
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [x] 4.2 实现分层分辨率选择器
    - 修改 `nextjs-frontend/components/ai/ModelSelector.tsx` 中的 CapabilityParams 组件
    - 当 `resolution_tiers` 存在时渲染两级联动选择器（档位 + 分辨率）
    - 当仅有 `resolutions` 时渲染单级下拉框
    - 档位切换时自动选中新档位的第一个分辨率
    - 两者都不存在时隐藏分辨率选择器
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 4.3 实现时长控件渲染
    - 当 `duration_options` 存在时渲染按钮组
    - 当仅有 `duration_range` 时渲染滑块
    - 同时存在时优先渲染 `duration_options`
    - 两者都不存在时隐藏时长控件
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 4.4 实现布尔开关类能力渲染
    - 当 `supports_prompt_extend` 为 true 时渲染"提示词扩展"开关
    - 当 `supports_watermark` 为 true 时渲染"添加水印"开关
    - 当 `supports_seed` 为 true 时渲染"种子值"数字输入框
    - 所有变更通过 `onParamsChange` 回调通知父组件
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 4.5 实现动态参考图片上传
    - 修改 ModelSelector 组件
    - `first_frame` 模式：单张上传，标签"首帧图片"
    - `first_last_frame` 模式：两个上传区，标签"首帧图片"+"尾帧图片"
    - `reference_to_video` 模式：多图上传，上限由 `max_reference_images` 决定
    - `text_to_video` 模式：隐藏上传区域
    - 切换输入模式时清空已上传图片
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 4.6 实现批量生成数量控件
    - 当 `max_output_images > 1` 时渲染"生成数量"数字输入框
    - 限制输入范围为 1 到 `max_output_images`
    - 不存在或等于 1 时隐藏
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 4.7 实现特殊功能标签展示
    - 当 `special_features` 非空时以 Badge 形式展示每个特殊功能
    - 为空或不存在时隐藏
    - _Requirements: 11.1, 11.2_

  - [x] 4.8 编写 CapabilityParams 单元测试
    - 测试各种 model_capabilities 组合的渲染结果
    - 测试输入模式切换下的上传区域渲染
    - 测试边界情况：空 capabilities、缺失字段、极端值
    - _Requirements: 6.3, 6.4, 7.3, 7.4, 9.1, 9.2, 9.4, 10.3, 11.2_

  - [x] 4.9 编写属性测试：分层分辨率联动选择
    - **Property 5: 分层分辨率联动选择**
    - **Validates: Requirements 6.2**

  - [x] 4.10 编写属性测试：档位切换默认选中首项
    - **Property 6: 档位切换默认选中首项**
    - **Validates: Requirements 6.5**

  - [x] 4.11 编写属性测试：分层分辨率存在时渲染两级选择器
    - **Property 7: 分层分辨率存在时渲染两级选择器**
    - **Validates: Requirements 6.1**

  - [x] 4.12 编写属性测试：时长控件渲染优先级
    - **Property 8: 时长控件渲染优先级**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 4.13 编写属性测试：布尔能力开关渲染
    - **Property 9: 布尔能力开关渲染**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x] 4.14 编写属性测试：参数变更回调
    - **Property 10: 参数变更回调**
    - **Validates: Requirements 8.4**

  - [x] 4.15 编写属性测试：参考图片上传数量限制
    - **Property 11: 参考图片上传数量限制**
    - **Validates: Requirements 9.3, 9.5**

  - [x] 4.16 编写属性测试：输入模式切换清空图片状态
    - **Property 12: 输入模式切换清空图片状态**
    - **Validates: Requirements 9.6**

  - [x] 4.17 编写属性测试：批量生成数量输入范围
    - **Property 13: 批量生成数量输入范围**
    - **Validates: Requirements 10.1, 10.2**

  - [x] 4.18 编写属性测试：特殊功能标签展示
    - **Property 14: 特殊功能标签展示**
    - **Validates: Requirements 11.1**

- [x] 5. Checkpoint - 前端组件验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 构建统一模型测试页面 - 页面框架与图片面板
  - [x] 6.1 创建模型测试页面框架
    - 创建 `nextjs-frontend/app/(aistudio)/ai/model-test/page.tsx`
    - 实现"文本"、"图片"、"视频"三个类别 Tab 切换
    - Tab 切换时加载该类别下所有已启用的模型配置
    - 实现侧边栏测试历史列表框架
    - _Requirements: 12.1, 12.2_

  - [x] 6.2 实现图片测试面板
    - 在图片 Tab 中集成 ModelSelector + CapabilityParams 组件
    - 实现图片生成请求提交（调用 `generate_media(category="image")`）
    - 实现加载状态（spinner + "生成中..."）
    - 实现图片预览区域，支持点击放大
    - 显示元信息（usage_id、积分消耗、生成耗时）
    - 实现错误状态展示（错误码 + 描述）
    - 保留当前会话内的历史生成结果列表
    - _Requirements: 12.4, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 6.3 编写图片面板单元测试
    - 测试加载状态和成功/失败状态的 UI 渲染
    - _Requirements: 13.1, 13.2, 13.4_

- [x] 7. 构建统一模型测试页面 - 视频面板
  - [x] 7.1 实现视频测试面板
    - 在视频 Tab 中集成 ModelSelector + CapabilityParams 组件
    - 实现视频生成请求提交（调用 `generate_media(category="video")`）
    - 实现任务状态指示器（提交中 → 排队中 → 生成中 → 已完成/失败）
    - 实现"生成中"状态的等待计时器
    - 实现视频播放器（播放/暂停/循环）
    - 显示视频元信息（时长、分辨率、usage_id、积分消耗）
    - 实现错误状态展示
    - 保留当前会话内的历史视频生成结果列表
    - _Requirements: 12.5, 12.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 7.2 编写视频面板单元测试
    - 测试任务状态指示器各状态的渲染
    - 测试视频播放器和错误状态
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [x] 7.3 编写属性测试：视频任务状态流转
    - **Property 19: 视频任务状态流转**
    - **Validates: Requirements 14.1**

- [x] 8. 构建统一模型测试页面 - 文本面板
  - [x] 8.1 实现文本测试对话界面
    - 在文本 Tab 中实现聊天对话界面
    - 实现流式输出（SSE），逐字显示模型回复
    - 支持多轮对话，保持上下文连续性
    - 实现"清空对话"按钮
    - 实现"停止生成"按钮，允许中断流式输出
    - 当模型 `supports_image` 为 true 时允许消息附加图片
    - _Requirements: 12.3, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 8.2 编写文本面板单元测试
    - 测试清空对话、停止生成按钮
    - 测试图片附加功能
    - _Requirements: 15.3, 15.4, 15.5_

  - [x] 8.3 编写属性测试：流式文本增量显示
    - **Property 20: 流式文本增量显示**
    - **Validates: Requirements 15.1**

  - [x] 8.4 编写属性测试：多轮对话上下文保持
    - **Property 21: 多轮对话上下文保持**
    - **Validates: Requirements 15.2**

- [x] 9. 实现测试历史记录与结果展示
  - [x] 9.1 实现测试历史记录管理
    - 在侧边栏显示当前模型配置的测试会话历史列表
    - 显示每个会话的创建时间和运行次数
    - 实现点击历史会话加载完整内容
    - 实现"新建会话"按钮
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 9.2 编写测试历史单元测试
    - 测试会话列表渲染和新建会话
    - _Requirements: 16.1, 16.4_

  - [x] 9.3 编写属性测试：类别切换加载对应模型
    - **Property 15: 类别切换加载对应模型**
    - **Validates: Requirements 12.2**

  - [x] 9.4 编写属性测试：生成结果元信息展示
    - **Property 16: 生成结果元信息展示**
    - **Validates: Requirements 13.3, 14.4**

  - [x] 9.5 编写属性测试：生成失败错误展示
    - **Property 17: 生成失败错误展示**
    - **Validates: Requirements 13.4, 14.5**

  - [x] 9.6 编写属性测试：生成历史累积
    - **Property 18: 生成历史累积**
    - **Validates: Requirements 13.5, 14.6**

  - [x] 9.7 编写属性测试：会话历史信息展示
    - **Property 22: 会话历史信息展示**
    - **Validates: Requirements 16.3**

  - [x] 9.8 编写属性测试：会话加载完整内容
    - **Property 23: 会话加载完整内容**
    - **Validates: Requirements 16.2**

- [x] 10. Final Checkpoint - 全部验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- Checkpoint 确保增量验证，后端迁移和前端组件分别验证
- 属性测试验证通用正确性，单元测试验证具体示例和边界情况
- 后端使用 Python (Hypothesis)，前端使用 TypeScript (fast-check) 进行属性测试
