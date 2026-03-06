# 视频模型重构实施方案

## 1. 现状分析

### 1.1 当前架构（三级模式）

```
AIManufacturer (厂商)  →  AIModelConfig (模型配置: api_key + base_url)  →  AIModelBinding (绑定 key)
         ↓                              ↓
    AIModel (目录)              MediaProviderFactory
    param_schema JSONB           → Provider.generate(MediaRequest)
    model_capabilities JSONB
```

**数据流**: 前端 `VideoOutputNode` → 创建 Task(`asset_video_generate`) → Task Handler → `ai_gateway_service.generate_media()` → `MediaProviderFactory` 根据 manufacturer 分派 → `ViduMediaProvider.generate()`

### 1.2 核心矛盾

| 问题 | 说明 |
|------|------|
| **ViduMediaProvider 只支持 text2video** | 硬编码 `/text2video` 端点，无法路由到 image2video / reference2video / start-end / multi-frame |
| **模型能力差异大** | 每个模型（viduQ3/Q2-pro/Q2-turbo 等）支持的分辨率、时长、模式不同，当前无模型级约束 |
| **param_json 万金油** | 前端传 `{ duration, aspect_ratio, image_data_urls }` 到 Provider，Provider 不知道该调哪个端点 |
| **前端 UI 无法适配** | `VideoOutputNode` 只展示固定的 ASPECT_RATIOS 和 DURATIONS，无模型级联动 |
| **ADR-0003 param_schema 在视频场景失效** | 视频模型的输入模式（mode）决定了整个请求结构，不是简单的参数差异，JSON Schema 难以表达 |

### 1.3 需要接入的厂商/模型（第一期 + 未来）

| 厂商 | 模型 | 模式 |
|------|------|------|
| **Vidu (第一期)** | viduQ3, viduq2-pro-fast, viduq2-turbo, viduq2-pro, viduq2 | 参考生视频、图生视频、首尾帧、智能多帧 |
| Kling (已有) | kling-v1 等 | text2video, image2video |
| Volcengine (已有) | seedance-2.0 等 | text2video |
| 海螺/即梦/Sora/Veo/Grok (未来) | 各有不同 | 各有不同 |

---

## 2. 重构决策：硬编码模型注册表

**核心原则**: 视频厂商/模型数量有限（<30），且每个模型的 API 协议差异大。**放弃数据库动态 param_schema，改用代码硬编码的模型注册表（Model Registry）**。

> 保留 `AIModelConfig` 表仅存储凭证（api_key + base_url），模型能力和参数约束由代码定义。

### 2.1 与 ADR-0003 的关系

ADR-0003 的 JSON Schema 方案**对图片模型仍然有效**（参数简单、模式单一）。视频模型因为存在多种生成模式（mode），每种模式的请求体结构完全不同，属于 ADR-0003 未覆盖的场景。本方案是对视频领域的补充，不影响图片模型。

---

## 3. 详细设计

### 3.1 后端：视频模型注册表（hardcoded）

新增文件 `fastapi_backend/app/ai_gateway/video_registry.py`:

```python
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum

class VideoMode(str, Enum):
    TEXT2VIDEO = "text2video"           # 文生视频
    IMAGE2VIDEO = "image2video"         # 图生视频（首帧）
    START_END = "start_end"             # 首尾帧生视频
    REFERENCE = "reference"             # 参考生视频（主体一致性）
    MULTI_FRAME = "multi_frame"         # 智能多帧

@dataclass(frozen=True)
class VideoModelSpec:
    """单个视频模型的硬编码能力声明"""
    code: str                                    # 模型标识，如 "viduQ3"
    display_name: str                            # 展示名
    manufacturer: str                            # 厂商 code，如 "vidu"
    modes: list[VideoMode]                       # 支持的生成模式
    durations: list[int]                         # 支持的时长(秒)，如 [4, 8]
    aspect_ratios: list[str]                     # 支持的宽高比
    resolutions: list[str] | None = None         # 支持的分辨率 (如 ["720p","1080p"])
    max_ref_images: int = 0                      # 最大参考图数量 (reference mode)
    max_frames: int = 0                          # 最大帧数 (multi_frame mode)
    supports_enhance: bool = False               # 是否支持智能超清
    style_options: list[str] | None = None       # 风格选项 (如 ["general","anime"])
    extra: dict = field(default_factory=dict)    # 厂商特有扩展字段

# ===== Vidu 模型注册 =====
VIDU_COMMON_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"]
VIDU_COMMON_MODES = [
    VideoMode.IMAGE2VIDEO,
    VideoMode.START_END,
    VideoMode.REFERENCE,
    VideoMode.MULTI_FRAME,
]

VIDU_Q3 = VideoModelSpec(
    code="viduQ3",
    display_name="Vidu Q3",
    manufacturer="vidu",
    modes=[VideoMode.TEXT2VIDEO] + VIDU_COMMON_MODES,
    durations=[4, 8],
    aspect_ratios=VIDU_COMMON_RATIOS,
    resolutions=["720p", "1080p"],
    max_ref_images=3,
    max_frames=6,
    style_options=["general", "anime"],
)

VIDU_Q2_PRO_FAST = VideoModelSpec(
    code="viduq2-pro-fast",
    display_name="Vidu Q2 Pro Fast",
    manufacturer="vidu",
    modes=[VideoMode.TEXT2VIDEO] + VIDU_COMMON_MODES,
    durations=[4, 8],
    aspect_ratios=VIDU_COMMON_RATIOS,
    resolutions=["720p", "1080p"],
    max_ref_images=3,
    max_frames=6,
    style_options=["general", "anime"],
)

# ... viduq2-turbo, viduq2-pro, viduq2 类似定义

# ===== Kling 模型注册 =====
KLING_V1 = VideoModelSpec(
    code="kling-v1",
    display_name="Kling V1",
    manufacturer="kling",
    modes=[VideoMode.TEXT2VIDEO, VideoMode.IMAGE2VIDEO],
    durations=[5, 10],
    aspect_ratios=["16:9", "9:16", "1:1"],
    max_ref_images=0,
)

# ===== 全局注册表 =====
VIDEO_MODEL_REGISTRY: dict[str, VideoModelSpec] = {}

def _register(*specs: VideoModelSpec):
    for s in specs:
        key = f"{s.manufacturer}/{s.code}"
        VIDEO_MODEL_REGISTRY[key] = s

_register(
    VIDU_Q3, VIDU_Q2_PRO_FAST,
    # ... 其他模型
    KLING_V1,
)

def get_video_model_spec(manufacturer: str, model: str) -> VideoModelSpec | None:
    return VIDEO_MODEL_REGISTRY.get(f"{manufacturer}/{model}")
```

### 3.2 后端：重构 ViduMediaProvider

将当前只支持 text2video 的 `ViduMediaProvider` 重构为支持 **模式路由**：

```python
# fastapi_backend/app/ai_gateway/providers/media/vidu.py

class ViduMediaProvider(MediaProvider):
    # Vidu API v2 端点映射
    MODE_ENDPOINTS: dict[str, str] = {
        "text2video":   "/text2video",
        "image2video":  "/img2video",
        "start_end":    "/img2video/start-end",     # 首尾帧
        "reference":    "/reference2video",          # 参考生视频
        "multi_frame":  "/img2video/multi-frame",    # 智能多帧
    }

    async def generate(self, request: MediaRequest) -> MediaResponse:
        mode = request.param_json.get("mode", "text2video")
        endpoint = self.MODE_ENDPOINTS.get(mode)
        if not endpoint:
            raise AppError(msg=f"Unsupported Vidu mode: {mode}", code=400)

        url = f"{self.base_url}{endpoint}"
        payload = self._build_payload(mode, request)
        # ... submit → poll → return
```

**关键变化**: `param_json.mode` 决定端点路由，每种模式有专用的 payload 构建逻辑。

### 3.3 后端：请求参数验证层

新增 `fastapi_backend/app/ai_gateway/video_validator.py`:

```python
def validate_video_request(
    spec: VideoModelSpec,
    mode: str,
    param_json: dict,
) -> dict:
    """根据模型注册表验证并规范化前端参数，返回清洗后的 param_json"""
    vm = VideoMode(mode)
    if vm not in spec.modes:
        raise AppError(msg=f"Model {spec.code} does not support mode: {mode}")

    duration = param_json.get("duration", spec.durations[0])
    if duration not in spec.durations:
        raise AppError(msg=f"Unsupported duration {duration} for {spec.code}")

    aspect_ratio = param_json.get("aspect_ratio", "16:9")
    if aspect_ratio not in spec.aspect_ratios:
        raise AppError(msg=f"Unsupported aspect_ratio {aspect_ratio}")

    images = param_json.get("image_data_urls", [])
    # 模式+图片数量校验
    if vm == VideoMode.TEXT2VIDEO and images:
        raise AppError(msg="text2video mode does not accept images")
    if vm == VideoMode.IMAGE2VIDEO and len(images) != 1:
        raise AppError(msg="image2video requires exactly 1 image")
    if vm == VideoMode.START_END and len(images) != 2:
        raise AppError(msg="start_end requires exactly 2 images (first + last frame)")
    if vm == VideoMode.REFERENCE and len(images) > spec.max_ref_images:
        raise AppError(msg=f"reference mode accepts max {spec.max_ref_images} images")
    if vm == VideoMode.MULTI_FRAME and len(images) > spec.max_frames:
        raise AppError(msg=f"multi_frame mode accepts max {spec.max_frames} frames")

    return {
        "mode": mode,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "image_data_urls": images,
        "style": param_json.get("style", "general"),
        "resolution": param_json.get("resolution", spec.resolutions[0] if spec.resolutions else None),
    }
```

### 3.4 后端：在 generate_media 流程中注入验证

在 `ai_gateway_service.generate_media()` 中，video 类型走注册表验证：

```python
# service.py → generate_media() 中
if category == "video":
    from app.ai_gateway.video_registry import get_video_model_spec
    from app.ai_gateway.video_validator import validate_video_request
    spec = get_video_model_spec(cfg.manufacturer, cfg.model)
    if spec:
        param_json = validate_video_request(spec, param_json.get("mode", "text2video"), param_json)
```

### 3.5 后端：新增 API 端点 — 视频模型能力查询

```
GET /api/ai/video-models
```

返回硬编码注册表的能力声明，供前端渲染 UI：

```json
{
  "data": [
    {
      "manufacturer": "vidu",
      "code": "viduQ3",
      "display_name": "Vidu Q3",
      "modes": ["text2video", "image2video", "start_end", "reference", "multi_frame"],
      "durations": [4, 8],
      "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
      "resolutions": ["720p", "1080p"],
      "max_ref_images": 3,
      "max_frames": 6,
      "style_options": ["general", "anime"]
    }
  ]
}
```

### 3.6 前端：VideoOutputNode 适配

#### 3.6.1 新增 `useVideoModelSpec` hook

从 `/api/ai/video-models` 获取模型能力，与 `useAIModelList` 配合：

```typescript
// hooks/useVideoModelSpec.ts
export interface VideoModelSpec {
  manufacturer: string;
  code: string;
  displayName: string;
  modes: VideoMode[];
  durations: number[];
  aspectRatios: string[];
  resolutions?: string[];
  maxRefImages: number;
  maxFrames: number;
  styleOptions?: string[];
}

export type VideoMode = 'text2video' | 'image2video' | 'start_end' | 'reference' | 'multi_frame';
```

#### 3.6.2 VideoOutputNode 改造要点

| 当前 | 改造后 |
|------|--------|
| 固定 `ASPECT_RATIOS` / `DURATIONS` | 从当前选中模型的 `VideoModelSpec` 动态获取 |
| 无 mode 概念 | 新增 **mode 选择器**：根据上游图片数量自动推断或手动选择 |
| `inputJson.images` 统一传 | 按 mode 分类传参：`image_data_urls` 含义不同 |
| 无分辨率选择 | 模型支持时显示分辨率选项 |
| 无风格选择 | Vidu 动漫模型支持 `style: "anime"` |

#### 3.6.3 Mode 智能推断逻辑

```typescript
function inferVideoMode(
  spec: VideoModelSpec,
  refImageCount: number,
): VideoMode {
  if (refImageCount === 0) return 'text2video';
  if (refImageCount === 1 && spec.modes.includes('image2video')) return 'image2video';
  if (refImageCount === 2 && spec.modes.includes('start_end')) return 'start_end';
  if (refImageCount > 2 && spec.modes.includes('multi_frame')) return 'multi_frame';
  if (spec.modes.includes('reference')) return 'reference';
  return 'image2video'; // fallback
}
```

#### 3.6.4 UI 线框（底部工具栏）

```
┌──────────────────────────────────────────────────────────┐
│  [Vidu Q3 ▾]  ·  [参考生视频 ▾]  ·  [16:9 · 4s ▾]  [▶] │
│                    ↑ mode 选择器                          │
└──────────────────────────────────────────────────────────┘
```

当 mode 为 reference / multi_frame 时，参考图区域显示 `@1 @2 @3` 角色/帧标签。

### 3.7 AI 模型测试（Chatbox 模式）适配

配置 Vidu 模型 API key 后，第一个验证场景就是在 AI 模型测试中测试不同模式的输入参数与输出表现。当前系统有**两个**视频模型测试入口，均需适配：

#### 3.7.1 现状分析：两个测试入口

| 入口 | 位置 | 组件 | 后端端点 |
|------|------|------|----------|
| **Settings 模态框** | `/aistudio/settings` → 模型测试按钮 | `ModelTestModal.tsx` | `POST /ai/admin/model-configs/{id}/test-video` |
| **独立测试页** | `/ai/model-test` → 视频 Tab | `page.tsx` → `VideoPanel` | `generateMedia()` (直接调用 AI Gateway) |

**当前数据流（Settings 模态框）**:
```
ModelTestModal
  → 选择 AIModelConfig (manufacturer · model)
  → 从 catalog 匹配 model_capabilities
  → CapabilityParams 渲染 input_mode / duration / aspect_ratio
  → ImagePromptComposer 上传参考图 (附件 → file_node_ids)
  → POST /ai/admin/model-configs/{id}/test-video
    body: { prompt, duration, aspect_ratio, attachment_file_node_ids, session_id, param_json }
  → 创建 Task(model_test_video_generate)
  → ModelTestVideoGenerateHandler → ai_gateway_service.generate_media()
  → ViduMediaProvider.generate()
```

**当前数据流（独立测试页）**:
```
VideoPanel
  → ModelSelector 选择模型 (从 catalog 加载)
  → CapabilityParams 渲染参数
  → generateMedia({ model_key, prompt, param_json, category: "video" })
  → 直接调用 AI Gateway
```

#### 3.7.2 当前问题

| 问题 | 说明 |
|------|------|
| **capabilities 来源即将变更** | 当前 `CapabilityParams` 依赖 `AIModel.model_capabilities`（数据库 catalog），重构后视频类型由 `VIDEO_MODEL_REGISTRY` 驱动 |
| **input_mode 标签不完整** | `CapabilityParams` 中 `INPUT_MODE_LABELS` 只有 4 种（`text_to_video`, `first_frame`, `first_last_frame`, `reference_to_video`），缺少 `multi_frame`（智能多帧） |
| **param_json 缺少 mode 字段** | 后端 `AdminAIModelConfigTestVideoRequest` 的 `param_json` 不包含 `mode`，导致 Provider 无法根据模式路由 |
| **ModelTestModal 的图片上传 → input_mode 联动不够** | `ModelSelector` 中按 `input_mode` 切换上传区域（首帧/首尾帧/参考图），但缺少 `multi_frame` 模式的多帧上传 UI |
| **独立测试页 VideoPanel 无图片上传** | `VideoPanel` 通过 `generateMedia()` 调用，`capParams` 中可能包含 `image_data_urls`（由 `ModelSelector` 注入），但没有直观的图片上传 UI |

#### 3.7.3 改造方案

##### A. 后端：`AdminAIModelConfigTestVideoRequest` 扩展

```python
# schemas_ai_models.py
class AdminAIModelConfigTestVideoRequest(BaseModel):
    prompt: str = Field(min_length=1)
    duration: int | None = None
    aspect_ratio: str | None = None
    mode: str | None = None                         # 新增：video mode (text2video/image2video/start_end/reference/multi_frame)
    attachment_file_node_ids: list[UUID] | None = None
    session_id: UUID | None = None
    param_json: dict[str, Any] | None = None
```

后端 `admin_test_model_config_video` 端点改造：
- 将 `body.mode` 写入 `merged_param_json["mode"]`
- 当 `mode` 不为空时，走 `video_validator` 校验（图片数量 vs mode 一致性）
- 校验失败立即返回清晰错误，而非等到 Provider 调用失败

##### B. 后端：`ModelTestVideoGenerateHandler` 改造

```python
# tasks/handlers/model_test_video_generate.py → run() 中
# 从 param_json 提取 mode，确保 ViduMediaProvider 能根据 mode 路由
param_json: dict[str, Any] = dict(payload.get("param_json") or {})
# mode 兜底：有图片时根据图片数量推断
if "mode" not in param_json:
    img_count = len(image_data_urls) if image_data_urls else 0
    if img_count == 0:
        param_json["mode"] = "text2video"
    elif img_count == 1:
        param_json["mode"] = "image2video"
    elif img_count == 2:
        param_json["mode"] = "start_end"
    else:
        param_json["mode"] = "multi_frame"
```

##### C. 前端：`CapabilityParams` 补充 multi_frame

```typescript
// CapabilityParams.tsx
const INPUT_MODE_LABELS: Record<string, string> = {
  text_to_video: "文生视频",
  first_frame: "首帧生视频",
  first_last_frame: "首尾帧生视频",
  reference_to_video: "参考生视频",
  multi_frame: "智能多帧",              // 新增
};
```

##### D. 前端：`ModelSelector` 补充 multi_frame 上传区域

在 `ModelSelector.tsx` 中，当 `currentInputMode === "multi_frame"` 时渲染多帧上传 UI：

```typescript
{currentInputMode === "multi_frame" && (
  <div className="space-y-2" data-testid="upload-multi-frame">
    <Label>关键帧图片</Label>
    <p className="text-xs text-muted-foreground">
      最多 {caps?.max_frames ?? 6} 帧，按时间顺序排列
    </p>
    {/* 复用 referenceFiles 逻辑，展示已上传帧列表 + 编号 */}
    {referenceFiles.length > 0 && (
      <div className="grid grid-cols-3 gap-2 mb-2">
        {referenceFiles.map((rf, idx) => (
          <div key={idx} className="relative h-24 rounded-md overflow-hidden border">
            <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              帧 {idx + 1}
            </div>
            <img src={rf.url} alt={`帧 ${idx + 1}`} className="object-cover w-full h-full" />
            <button type="button" onClick={() => removeReferenceFile(idx)} ...>✕</button>
          </div>
        ))}
      </div>
    )}
    {referenceFiles.length < (caps?.max_frames ?? 6) && (
      <Input type="file" accept="image/*" multiple onChange={handleReferenceUpload} />
    )}
  </div>
)}
```

##### E. 前端：Settings `ModelTestModal` 改造

`ModelTestModal` 中视频测试的 `submitModelTestImage()` 调用需要：
1. 将当前 `capParams.input_mode` 映射为注册表的 `mode` 值
2. 在 POST body 中携带 `mode` 字段
3. 视频 Run 记录展示中增加 **mode** 标签（当前只展示 `aspect_ratio · 参考图 N`）

Mode 映射关系（`CapabilityParams.input_mode` → `VideoMode`）：

| CapabilityParams input_mode | VideoMode (注册表) |
|---|---|
| `text_to_video` | `text2video` |
| `first_frame` | `image2video` |
| `first_last_frame` | `start_end` |
| `reference_to_video` | `reference` |
| `multi_frame` | `multi_frame` |

```typescript
// ModelTestModal 或调用方中
const INPUT_MODE_TO_VIDEO_MODE: Record<string, string> = {
  text_to_video: "text2video",
  first_frame: "image2video",
  first_last_frame: "start_end",
  reference_to_video: "reference",
  multi_frame: "multi_frame",
};

// 构建请求时
const videoMode = INPUT_MODE_TO_VIDEO_MODE[capParams.input_mode] || "text2video";
body.mode = videoMode;
body.param_json = { ...capParams, mode: videoMode };
```

##### F. 前端：独立测试页 `VideoPanel` 改造

`VideoPanel` 当前通过 `generateMedia()` 直接调用，`capParams` 透传为 `param_json`。需要：
1. 确保 `ModelSelector` 传出的 `capParams` 包含正确的 `input_mode` → `mode` 映射
2. 在 `handleGenerate` 中将 `input_mode` 转换为 `mode` 后放入 `param_json`：

```typescript
const handleGenerate = async () => {
  // ...
  const videoMode = INPUT_MODE_TO_VIDEO_MODE[capParams.input_mode] || "text2video";
  const res = await generateMedia({
    model_key: selectedModelCode,
    prompt,
    negative_prompt: negativePrompt || undefined,
    param_json: { ...capParams, mode: videoMode },
    category: "video",
  });
  // ...
};
```

##### G. capabilities 数据源过渡策略

重构后 `VIDEO_MODEL_REGISTRY` 替代数据库 `model_capabilities`，但模型测试页的 `CapabilityParams` 仍需 `ModelCapabilities` 对象驱动 UI。

**过渡方案**：后端 `/api/ai/video-models` 返回的 `VideoModelSpec` 同时输出一个兼容的 `model_capabilities` 子对象：

```python
# video_registry.py 新增方法
def to_model_capabilities(spec: VideoModelSpec) -> dict:
    """将硬编码 VideoModelSpec 转换为 ModelCapabilities 格式，兼容现有前端组件"""
    caps: dict = {
        "aspect_ratios": spec.aspect_ratios,
    }
    if spec.durations:
        caps["duration_options"] = spec.durations
    if spec.resolutions:
        caps["resolutions"] = spec.resolutions
    if spec.modes:
        caps["input_modes"] = _modes_to_input_modes(spec.modes)
    if spec.max_ref_images:
        caps["max_reference_images"] = spec.max_ref_images
    if spec.max_frames:
        caps["max_frames"] = spec.max_frames
    return caps

def _modes_to_input_modes(modes: list[VideoMode]) -> list[str]:
    """VideoMode enum → CapabilityParams input_mode 标签"""
    mapping = {
        VideoMode.TEXT2VIDEO: "text_to_video",
        VideoMode.IMAGE2VIDEO: "first_frame",
        VideoMode.START_END: "first_last_frame",
        VideoMode.REFERENCE: "reference_to_video",
        VideoMode.MULTI_FRAME: "multi_frame",
    }
    return [mapping[m] for m in modes if m in mapping]
```

这样前端 `CapabilityParams` 和 `ModelSelector` **无需大改**，只需将数据源从 catalog API 切换为 `/api/ai/video-models` 即可。

#### 3.7.4 测试验收场景（核心 Checklist）

配置 Vidu API Key 后，在 AI 模型测试中依次验证：

| # | 场景 | 入口 | 预期行为 |
|---|------|------|----------|
| T1 | **文生视频** — 无图片，纯 prompt | Settings 模态框 / 独立页 | mode=text2video，成功生成视频并在聊天中播放 |
| T2 | **首帧生视频** — 上传 1 张图 | Settings 模态框 | input_mode=first_frame → mode=image2video，首帧 + prompt 生成视频 |
| T3 | **首尾帧生视频** — 上传 2 张图 | Settings 模态框 | input_mode=first_last_frame → mode=start_end，首尾帧 + prompt 生成视频 |
| T4 | **参考生视频** — 上传 1~3 张参考图 | Settings 模态框 | input_mode=reference_to_video → mode=reference，参考图 + prompt 生成视频 |
| T5 | **智能多帧** — 上传 2~6 张帧图 | Settings 模态框 | input_mode=multi_frame → mode=multi_frame，多帧 + prompt 生成视频 |
| T6 | **参数约束** — 切换模型后 duration/ratio 选项更新 | 两个入口 | CapabilityParams 根据注册表动态渲染 |
| T7 | **模式/图片数量不匹配** — mode=start_end 但只上传 1 张图 | Settings 模态框 | 后端 validator 返回清晰错误，聊天气泡展示错误信息 |
| T8 | **模型切换** — 从 viduQ3 切换到 viduq2-turbo | 两个入口 | 参数面板重置为新模型的默认值，mode 选项更新 |
| T9 | **Run 记录回溯** — 切换到历史 session 查看之前的视频生成结果 | Settings 模态框 | 聊天气泡展示 prompt + mode + 参考图缩略图 + 视频播放 |
| T10 | **未在注册表的模型** — 配置一个未注册的 video model | Settings 模态框 | 跳过 validator，透传 param_json，兼容旧流程 |

---

## 4. Vidu API 端点详细映射

基于 Vidu API v2 (`https://api.vidu.cn/ent/v2`)：

| 模式 | 端点 | 必填参数 | 图片要求 |
|------|------|----------|----------|
| text2video | `POST /text2video` | model, prompt, duration, aspect_ratio | 无 |
| image2video | `POST /img2video` | model, prompt, duration, images[0]=首帧 | 1 张 |
| start_end | `POST /img2video` | model, prompt, duration, images[0]=首帧, images[1]=尾帧 | 2 张 |
| reference | `POST /reference2video` | model, prompt, duration, images[]=参考图 | 1~3 张 |
| multi_frame | `POST /img2video/multi-frame` | model, prompt, duration, frames[]=关键帧 | 2~6 张 |

任务管理（所有模式共用）：
- 查询任务: `GET /tasks/{task_id}`
- 查询列表: `GET /tasks`
- 取消任务: `POST /tasks/{task_id}/cancel`

---

## 5. 实施分期

### Phase 1: 后端核心（2-3天）

| # | 任务 | 文件 |
|---|------|------|
| 1.1 | 创建 `video_registry.py` — 定义 VideoModelSpec + 注册 Vidu 5 个模型 + `to_model_capabilities()` | 新文件 |
| 1.2 | 创建 `video_validator.py` — 请求参数校验 | 新文件 |
| 1.3 | 重构 `ViduMediaProvider` — 支持 5 种模式路由 + 各模式 payload 构建 | `providers/media/vidu.py` |
| 1.4 | `service.py` 注入验证层 | `ai_gateway/service.py` |
| 1.5 | 新增 `/api/ai/video-models` 端点（含 `model_capabilities` 兼容输出） | 新路由文件 |
| 1.6 | 补充 Kling / Volcengine 到注册表（能力声明，不改 Provider 逻辑） | `video_registry.py` |
| 1.7 | `AdminAIModelConfigTestVideoRequest` 新增 `mode` 字段 | `schemas_ai_models.py` |
| 1.8 | `admin_test_model_config_video` 端点注入 mode → param_json + validator 校验 | `api/v1/ai_model_configs.py` |
| 1.9 | `ModelTestVideoGenerateHandler` 增加 mode 兜底推断逻辑 | `tasks/handlers/model_test_video_generate.py` |

### Phase 2: 前端适配（2-3天）

| # | 任务 | 文件 |
|---|------|------|
| 2.1 | 新增 `useVideoModelSpec` hook | `hooks/useVideoModelSpec.ts` |
| 2.2 | `VideoOutputNode` — 动态 mode/duration/ratio/resolution 选择器 | `VideoOutputNode.tsx` |
| 2.3 | `VideoOutputNode` — mode 智能推断 + param_json 按模式构建 | `VideoOutputNode.tsx` |
| 2.4 | `types.ts` — 扩展 `VideoOutputNodeData` 增加 mode 字段 | `lib/canvas/types.ts` |
| 2.5 | `CapabilityParams` 补充 `multi_frame` input_mode 标签 | `CapabilityParams.tsx` |
| 2.6 | `ModelSelector` 补充 `multi_frame` 模式的多帧上传 UI | `ModelSelector.tsx` |
| 2.7 | `ModelTestModal` — submitModelTestImage 注入 `input_mode → mode` 映射 + body.mode | `ModelTestModal.tsx` 调用方 |
| 2.8 | `ModelTestModal` — 视频 Run 气泡展示增加 mode 标签 | `ModelTestModal.tsx` |
| 2.9 | `VideoPanel`（独立测试页）— handleGenerate 注入 mode 映射 | `page.tsx` |
| 2.10 | 两个测试入口 capabilities 数据源切换到 `/api/ai/video-models`（视频类型） | `ModelTestModal.tsx` + `ModelSelector.tsx` |

### Phase 3: 质量保障（1-2天）

| # | 任务 |
|---|------|
| 3.1 | 后端单元测试：video_validator 各模式校验 |
| 3.2 | 后端集成测试：ViduMediaProvider mock 测试 |
| 3.3 | 后端测试：admin_test_model_config_video 端点 mode 参数传递 |
| 3.4 | 前端：VideoOutputNode 模式切换 e2e |
| 3.5 | 前端：模型测试 Chatbox 模式 — T1~T10 验收场景（见 3.7.4） |
| 3.6 | 前端：VideoPanel.test.tsx 补充 mode 相关用例 |

---

## 6. 兼容性策略

| 场景 | 处理 |
|------|------|
| **已有 video 类型 AIModelConfig** | 保持不变，`manufacturer=vidu` + `model=viduQ3` 仍走 MediaProviderFactory |
| **未在注册表中的模型** | 跳过验证，直接透传 param_json（向下兼容） |
| **前端旧版 VideoOutputNode（无 mode）** | 默认 `mode=text2video`，有图片时自动升级为 `image2video` |
| **数据库 AIModel.param_schema** | 视频类型弃用此字段，保留但不读取；图片类型继续使用 |
| **数据库 AIModel.model_capabilities** | 视频类型由注册表替代；前端使用 `/api/ai/video-models` 而非 catalog |

---

## 7. 架构变更总结

```
                          ┌─────────────────────────────┐
                          │  VIDEO_MODEL_REGISTRY       │
                          │  (hardcoded in Python)       │
                          │  viduQ3, viduq2-pro, ...     │
                          └──────────┬──────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
    /api/ai/video-models      video_validator        ViduMediaProvider
    (前端 UI 驱动)            (请求校验)             (mode → endpoint 路由)
           │                         │                         │
    ┌──────┼──────┐                  ▼                         ▼
    ▼      ▼      ▼           generate_media()          Vidu API v2
  Canvas  模型测试  独立测试   (注入验证)               POST /text2video
  Video   Modal    页 Video                            POST /img2video
  Output  (chatbox) Panel                              POST /reference2video
  Node                                                 POST /img2video/multi-frame
    │      │        │
    ▼      ▼        ▼
  param_json: { mode, duration, aspect_ratio, image_data_urls, ... }

  ── Settings Modal 流程 ──────────────────────────────────────────
  ModelTestModal → CapabilityParams (input_mode/duration/ratio)
                 → ImagePromptComposer (上传参考图)
                 → POST /ai/admin/model-configs/{id}/test-video
                     body.mode = INPUT_MODE_TO_VIDEO_MODE[input_mode]
                 → Task(model_test_video_generate)
                 → ModelTestVideoGenerateHandler
                 → ai_gateway_service.generate_media()
                 → video_validator → ViduMediaProvider
```

**改动最小原则**:
- `MediaProvider` 接口 **不变**
- `MediaRequest` / `MediaResponse` **不变**
- `MediaProviderFactory` **不变**
- `AIModelConfig` 表 **不变**（只存凭证）
- `CapabilityParams` / `ModelSelector` **逻辑不变**，仅新增 `multi_frame` 支持 + 数据源切换
- 仅新增 registry + validator + 重写 vidu provider + 新 API 端点 + mode 映射层

---

## 8. 需要确认的问题

1. **Vidu API v2 各端点的精确请求/响应结构** — 需参照最新官方文档或实测确认（当前网页抓取未获得 API Body 细节）
2. **Vidu 模型清单的精确分辨率/时长/模式矩阵** — 需查看 https://platform.vidu.cn/docs/model-map 的实际表格数据
3. **是否需要支持 callback_url 模式** — 当前用轮询，callback 可作为后续优化
4. **积分消耗映射** — 不同模型/模式/时长的积分定价表
