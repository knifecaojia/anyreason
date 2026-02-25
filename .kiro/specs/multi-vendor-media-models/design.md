# 设计文档：多厂商媒体生成模型集成

## 1. 概述

本设计文档描述如何扩展言之有理（AnyReason）平台的 AI 媒体生成能力，集成多个厂商的图片和视频生成模型 API，并优化数据库模型以结构化存储各厂商模型的能力限制。

### 1.1 设计目标

1. 扩展 `AIModel` 数据模型，新增 `model_capabilities` 字段存储模型能力信息
2. 实现多厂商 Provider（阿里云、火山引擎、Gemini）的统一接入
3. 提供前端 API 查询模型能力，支持动态渲染参数配置表单

### 1.2 当前系统分析

#### 现有数据模型

- `AIManufacturer`：厂商实体，包含 `code`、`name`、`category`、`provider_class` 等字段
- `AIModel`：模型实体，包含 `code`、`name`、`param_schema`、`model_metadata` 等字段
- `AIModelConfig`：用户配置的厂商+模型+API Key 运行时凭证

#### 现有 Provider 架构

- `MediaProvider`：抽象基类，定义 `generate(request: MediaRequest) -> MediaResponse` 接口
- `MediaProviderFactory`：工厂类，根据 `manufacturer` 分发到具体 Provider
- 已实现的 Provider：`AliyunMediaProvider`、`VolcengineMediaProvider`、`GeminiMediaProvider`、`ViduMediaProvider`

#### 现有问题

1. `AIModel` 缺少 `model_capabilities` 字段，无法结构化存储分辨率、宽高比、时长等能力信息
2. `AliyunMediaProvider` 仅支持部分模型，未覆盖万向视频系列的多种输入模式
3. 缺少 Gemini 中转 API Provider（`GeminiProxyProvider`）
4. 火山引擎视频 Provider（`VolcengineVideoProvider`）未完整实现

---

## 2. 数据库设计

### 2.1 AIModel 表扩展

在 `AIModel` 表中新增 `model_capabilities` JSONB 字段：

```sql
ALTER TABLE ai_models ADD COLUMN model_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_models ADD COLUMN category VARCHAR(16);

-- 添加索引
CREATE INDEX idx_ai_models_category ON ai_models(category);

-- 添加约束
ALTER TABLE ai_models ADD CONSTRAINT ck_ai_models_category 
  CHECK (category IS NULL OR category IN ('text', 'image', 'video'));
```

### 2.2 model_capabilities 结构定义

#### 图片模型能力结构

```json
{
  "resolutions": ["1024x1024", "1280x720", "720x1280"],
  "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
  "pixel_range": {
    "min": 262144,
    "max": 4194304,
    "recommended_min": 1048576,
    "recommended_max": 2359296
  },
  "supports_negative_prompt": true,
  "supports_prompt_extend": true,
  "supports_reference_image": true,
  "max_reference_images": 14,
  "max_output_images": 4,
  "supports_watermark": true,
  "supports_seed": true,
  "api_endpoint": "text2image/image-synthesis",
  "special_features": ["text_rendering", "multi_subject_consistency"]
}
```

#### 视频模型能力结构

```json
{
  "resolution_tiers": {
    "480P": ["854x480", "480x854", "640x640"],
    "720P": ["1280x720", "720x1280", "960x960", "1088x832", "832x1088"],
    "1080P": ["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"]
  },
  "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
  "duration_range": {
    "min": 2,
    "max": 15,
    "options": [5, 10]
  },
  "input_modes": ["first_frame", "first_last_frame", "reference_to_video"],
  "supports_negative_prompt": true,
  "supports_prompt_extend": true,
  "supports_audio_input": true,
  "supports_multi_shot": true,
  "max_reference_images": 5,
  "max_reference_videos": 3,
  "supports_watermark": true,
  "supports_seed": true,
  "api_endpoint": "image2video/video-synthesis"
}
```

---

## 3. 后端架构设计

### 3.1 Provider 类图

```
MediaProvider (ABC)
├── AliyunMediaProvider
│   ├── generate_image()  # 千问文生图、Z-Image、万向文生图
│   └── generate_video()  # 万向视频系列（首帧、首尾帧、参考生视频）
├── VolcengineMediaProvider
│   └── generate_image()  # SeedDream 4.5/5.0
├── VolcengineVideoProvider
│   └── generate_video()  # Seedance 2.0
├── GeminiMediaProvider
│   └── generate_image()  # Gemini 原生 API
└── GeminiProxyProvider (新增)
    └── generate_image()  # Gemini 中转 API（原生风格 + OpenAI 兼容）
```

### 3.2 AliyunMediaProvider 重构

```python
class AliyunMediaProvider(MediaProvider):
    # 模型到端点的映射
    ENDPOINT_MAP = {
        # 图片模型
        "qwen-image-max": "text2image/image-synthesis",
        "qwen-image-plus": "text2image/image-synthesis",
        "z-image-turbo": "text2image/image-synthesis",
        "wan2.6-t2i": "multimodal-generation/generation",
        "wan2.5-t2i": "multimodal-generation/generation",
        # 视频模型
        "wan2.6-i2v": "image2video/video-synthesis",
        "wan2.5-i2v": "image2video/video-synthesis",
        "wan2.2-kf2v-flash": "image2video/video-synthesis",
        "wanx2.1-kf2v-plus": "image2video/video-synthesis",
        "wan2.6-r2v": "video-generation/video-synthesis",
        "wan2.6-r2v-flash": "video-generation/video-synthesis",
    }
    
    async def generate(self, request: MediaRequest) -> MediaResponse:
        endpoint = self._get_endpoint(request.model_key)
        if self._is_video_model(request.model_key):
            return await self._generate_video(request, endpoint)
        return await self._generate_image(request, endpoint)
```

### 3.3 GeminiProxyProvider 设计（新增）

```python
class GeminiProxyProvider(MediaProvider):
    """Gemini 中转 API 提供者，支持原生风格和 OpenAI 兼容两种模式"""
    
    def __init__(self, api_key: str, base_url: str, mode: str = "native"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.mode = mode  # "native" 或 "openai_compat"
        self.minio = get_minio_client()
    
    async def generate(self, request: MediaRequest) -> MediaResponse:
        if self.mode == "openai_compat":
            return await self._generate_openai_compat(request)
        return await self._generate_native(request)
    
    async def _generate_openai_compat(self, request: MediaRequest) -> MediaResponse:
        """OpenAI Chat Completion 兼容接口"""
        payload = {
            "model": request.model_key,  # e.g., "gemini-2.0-flash-exp-image-generation"
            "messages": [
                {"role": "user", "content": [
                    {"type": "text", "text": request.prompt}
                ]}
            ],
            "max_tokens": 4096
        }
        # ... 发送请求，解析 base64 图片，上传 MinIO
    
    async def _generate_native(self, request: MediaRequest) -> MediaResponse:
        """原生风格 API"""
        # 与 GeminiMediaProvider 类似，但使用中转站 base_url
```

### 3.4 VolcengineVideoProvider 完整实现

```python
class VolcengineVideoProvider(MediaProvider):
    """火山引擎视频生成 Provider（Seedance 2.0）"""
    
    async def generate(self, request: MediaRequest) -> MediaResponse:
        # 1. 提交任务
        task_id = await self._submit_task(request)
        
        # 2. 轮询任务状态（最大10分钟，间隔2秒）
        for _ in range(300):
            await asyncio.sleep(2)
            status, result = await self._query_task(task_id)
            
            if status == "SUCCEEDED":
                return MediaResponse(
                    url=result["video_url"],
                    duration=result.get("duration"),
                    usage_id=task_id,
                    meta=result
                )
            elif status in ["FAILED", "CANCELED"]:
                raise AppError(msg=f"Task failed: {result.get('message')}", code=502)
        
        raise AppError(msg="Task timeout", code=504)
```

### 3.5 MediaProviderFactory 扩展

```python
class MediaProviderFactory:
    PROVIDER_MAP = {
        # 图片厂商
        "aliyun": AliyunMediaProvider,
        "volcengine": VolcengineMediaProvider,
        "gemini": GeminiMediaProvider,
        "gemini_proxy": GeminiProxyProvider,  # 新增
        # 视频厂商
        "aliyun_video": AliyunMediaProvider,  # 复用，内部区分
        "volcengine_video": VolcengineVideoProvider,
        "vidu": ViduMediaProvider,
    }
    
    def get_provider(self, manufacturer: str, api_key: str, base_url: str = None) -> MediaProvider:
        provider_cls = self.PROVIDER_MAP.get(manufacturer.lower())
        if not provider_cls:
            raise AppError(msg=f"Unsupported provider: {manufacturer}", code=400)
        return provider_cls(api_key=api_key, base_url=base_url) if base_url else provider_cls(api_key=api_key)
```

---

## 4. API 设计

### 4.1 模型能力查询 API

```
GET /api/v1/ai-catalog/models?category=image&enabled_only=true
```

响应示例：

```json
{
  "manufacturers": [
    {
      "code": "aliyun",
      "name": "阿里云",
      "models": [
        {
          "code": "qwen-image-max",
          "name": "千问文生图 Max",
          "model_capabilities": {
            "resolutions": ["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"],
            "aspect_ratios": ["16:9", "4:3", "1:1", "3:4", "9:16"],
            "supports_negative_prompt": true,
            "supports_prompt_extend": true
          },
          "param_schema": { ... }
        }
      ]
    }
  ]
}
```

### 4.2 AI Catalog Service 扩展

```python
class AIModelService:
    async def list_with_capabilities(
        self,
        *,
        db: AsyncSession,
        category: str,
        enabled_only: bool = True,
    ) -> list[dict]:
        """返回指定类别的所有模型及其能力信息"""
        q = (
            select(AIModel)
            .options(selectinload(AIModel.manufacturer))
            .join(AIManufacturer)
            .where(AIManufacturer.category == category)
        )
        if enabled_only:
            q = q.where(AIModel.enabled == True, AIManufacturer.enabled == True)
        q = q.order_by(AIManufacturer.sort_order, AIModel.sort_order)
        
        models = (await db.execute(q)).scalars().all()
        
        # 按厂商分组
        result = {}
        for model in models:
            manu_code = model.manufacturer.code
            if manu_code not in result:
                result[manu_code] = {
                    "code": manu_code,
                    "name": model.manufacturer.name,
                    "models": []
                }
            result[manu_code]["models"].append({
                "code": model.code,
                "name": model.name,
                "model_capabilities": model.model_capabilities,
                "param_schema": model.param_schema,
            })
        
        return list(result.values())
```

---

## 5. 初始化数据设计

### 5.1 阿里云图片模型种子数据

```python
ALIYUN_IMAGE_MODELS = [
    {
        "code": "qwen-image-max",
        "name": "千问文生图 Max",
        "model_capabilities": {
            "resolutions": ["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"],
            "aspect_ratios": ["16:9", "4:3", "1:1", "3:4", "9:16"],
            "supports_negative_prompt": True,
            "supports_prompt_extend": True,
            "supports_watermark": True,
            "supports_seed": True,
            "api_endpoint": "text2image/image-synthesis"
        }
    },
    {
        "code": "z-image-turbo",
        "name": "Z-Image Turbo",
        "model_capabilities": {
            "pixel_range": {"min": 262144, "max": 4194304, "recommended_min": 1048576, "recommended_max": 2359296},
            "supports_prompt_extend": True,
            "supports_seed": True,
            "api_endpoint": "text2image/image-synthesis"
        }
    },
    {
        "code": "wan2.6-t2i",
        "name": "万向文生图 V2 (2.6)",
        "model_capabilities": {
            "pixel_range": {"min": 1638400, "max": 2073600},
            "aspect_ratio_range": {"min": 0.25, "max": 4.0},
            "max_output_images": 4,
            "supports_negative_prompt": True,
            "supports_prompt_extend": True,
            "supports_watermark": True,
            "supports_seed": True,
            "api_endpoint": "multimodal-generation/generation"
        }
    }
]
```

### 5.2 阿里云视频模型种子数据

```python
ALIYUN_VIDEO_MODELS = [
    {
        "code": "wan2.6-i2v",
        "name": "万向图生视频-首帧 (2.6)",
        "model_capabilities": {
            "input_modes": ["first_frame"],
            "resolution_tiers": {
                "480P": ["854x480", "480x854", "640x640"],
                "720P": ["1280x720", "720x1280", "960x960", "1088x832", "832x1088"],
                "1080P": ["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"]
            },
            "duration_range": {"min": 2, "max": 15},
            "supports_audio_input": True,
            "supports_multi_shot": True,
            "supports_template": True,
            "supports_negative_prompt": True,
            "supports_prompt_extend": True,
            "supports_watermark": True,
            "supports_seed": True,
            "api_endpoint": "image2video/video-synthesis"
        }
    },
    {
        "code": "wan2.2-kf2v-flash",
        "name": "万向图生视频-首尾帧 Flash",
        "model_capabilities": {
            "input_modes": ["first_last_frame"],
            "resolution_tiers": {
                "480P": ["854x480", "480x854", "640x640"],
                "720P": ["1280x720", "720x1280", "960x960"],
                "1080P": ["1920x1080", "1080x1920", "1440x1440"]
            },
            "duration_options": [5],
            "supports_template": True,
            "supports_negative_prompt": True,
            "supports_prompt_extend": True,
            "supports_watermark": True,
            "supports_seed": True,
            "api_endpoint": "image2video/video-synthesis"
        }
    },
    {
        "code": "wan2.6-r2v",
        "name": "万向参考生视频 (2.6)",
        "model_capabilities": {
            "input_modes": ["reference_to_video"],
            "resolution_tiers": {
                "720P": ["1280x720", "720x1280", "960x960", "1088x832", "832x1088"],
                "1080P": ["1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632"]
            },
            "duration_range": {"min": 2, "max": 10},
            "max_reference_images": 5,
            "max_reference_videos": 3,
            "supports_multi_shot": True,
            "supports_audio": True,
            "supports_watermark": True,
            "supports_seed": True,
            "api_endpoint": "video-generation/video-synthesis"
        }
    }
]
```

### 5.3 火山引擎模型种子数据

```python
VOLCENGINE_IMAGE_MODELS = [
    {
        "code": "doubao-seedream-4-5",
        "name": "SeedDream 4.5",
        "model_capabilities": {
            "resolution_tiers": ["2K", "4K"],
            "resolution_examples": ["2048x2048", "2560x1440", "1728x2304"],
            "pixel_range": {"min": 3686400, "max": 16777216},
            "aspect_ratio_range": {"min": 0.0625, "max": 16.0},
            "supports_reference_image": True,
            "max_reference_images": 14,
            "special_features": ["text_rendering", "multi_subject_consistency", "material_realism"]
        }
    },
    {
        "code": "doubao-seedream-5-0",
        "name": "SeedDream 5.0",
        "model_capabilities": {
            "resolution_tiers": ["2K", "4K"],
            "pixel_range": {"min": 3686400, "max": 16777216},
            "aspect_ratio_range": {"min": 0.0625, "max": 16.0},
            "supports_reference_image": True,
            "max_reference_images": 14,
            "special_features": ["text_rendering", "multi_subject_consistency", "web_search", "multi_turn_editing"]
        }
    }
]

VOLCENGINE_VIDEO_MODELS = [
    {
        "code": "seedance-2-0",
        "name": "Seedance 2.0",
        "model_capabilities": {
            "resolution": "2K",
            "supports_multi_shot": True,
            "max_reference_images": 5,
            "supports_video_completion": True,
            "max_video_completion_duration": 15,
            "supports_lip_sync": True,
            "supported_languages": ["zh", "en", "es", "fr", "de", "ja", "ko", "pt"]
        }
    }
]
```

### 5.4 Gemini 模型种子数据

```python
GEMINI_IMAGE_MODELS = [
    {
        "code": "gemini-2.5-flash-image",
        "name": "Gemini 2.5 Flash Image",
        "model_capabilities": {
            "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
            "resolution_tiers": ["1K", "2K"],
            "supports_reference_image": True,
            "max_reference_images": 14,
            "supports_search_grounding": True,
            "supports_thinking": True
        }
    },
    {
        "code": "gemini-3-pro-image-preview",
        "name": "Gemini 3 Pro Image Preview",
        "model_capabilities": {
            "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
            "resolution_tiers": ["1K", "2K", "4K"],
            "supports_reference_image": True,
            "max_reference_images": 14,
            "supports_search_grounding": True,
            "supports_thinking": True
        }
    }
]

# Gemini 中转 API 厂商
GEMINI_PROXY_MODELS = [
    {
        "code": "gemini-2.0-flash-exp-image-generation",
        "name": "Gemini 2.0 Flash (中转)",
        "model_capabilities": {
            "api_modes": ["native", "openai_compat"],
            "response_format": "base64",
            "supports_reference_image": True
        }
    }
]
```

---

## 6. 前端设计

### 6.1 模型选择器组件

```typescript
interface ModelCapabilities {
  resolutions?: string[];
  aspect_ratios?: string[];
  resolution_tiers?: Record<string, string[]>;
  duration_range?: { min: number; max: number };
  duration_options?: number[];
  input_modes?: string[];
  supports_negative_prompt?: boolean;
  supports_reference_image?: boolean;
  max_reference_images?: number;
}

interface ModelSelectorProps {
  category: 'image' | 'video';
  onModelSelect: (model: AIModel) => void;
  onParamsChange: (params: Record<string, any>) => void;
}

function ModelSelector({ category, onModelSelect, onParamsChange }: ModelSelectorProps) {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  
  // 根据 model_capabilities 动态渲染参数表单
  const renderParamForm = (capabilities: ModelCapabilities) => {
    return (
      <>
        {capabilities.resolutions && (
          <Select label="分辨率" options={capabilities.resolutions} />
        )}
        {capabilities.aspect_ratios && (
          <Select label="宽高比" options={capabilities.aspect_ratios} />
        )}
        {capabilities.duration_range && (
          <Slider 
            label="时长" 
            min={capabilities.duration_range.min} 
            max={capabilities.duration_range.max} 
          />
        )}
        {capabilities.input_modes && (
          <Select label="输入模式" options={capabilities.input_modes} />
        )}
        {capabilities.supports_negative_prompt && (
          <Textarea label="负向提示词" />
        )}
        {capabilities.supports_reference_image && (
          <ImageUploader maxCount={capabilities.max_reference_images || 1} />
        )}
      </>
    );
  };
}
```

---

## 7. 迁移计划

### 7.1 数据库迁移

1. 创建 Alembic 迁移脚本，添加 `model_capabilities` 和 `category` 字段
2. 运行迁移，更新现有数据

### 7.2 代码变更顺序

1. **Phase 1**: 数据库迁移 + AIModel 模型更新
2. **Phase 2**: 新增 GeminiProxyProvider
3. **Phase 3**: 重构 AliyunMediaProvider 支持多模型
4. **Phase 4**: 完善 VolcengineVideoProvider
5. **Phase 5**: 更新 MediaProviderFactory
6. **Phase 6**: 新增模型能力查询 API
7. **Phase 7**: 前端模型选择器组件

---

## 8. 正确性属性

### 8.1 数据完整性

- **P1**: 所有注册的模型必须包含有效的 `model_capabilities` JSON
- **P2**: `model_capabilities` 中的分辨率列表必须与官方 API 文档一致

### 8.2 Provider 行为

- **P3**: AliyunMediaProvider 必须根据模型类型选择正确的 API 端点
- **P4**: 所有异步任务 Provider 必须实现超时处理（图片5分钟，视频10分钟）
- **P5**: GeminiProxyProvider 返回的 base64 图片必须成功上传到 MinIO

### 8.3 API 响应

- **P6**: 模型能力查询 API 返回的数据必须与数据库中的 `model_capabilities` 一致
- **P7**: 前端根据 `model_capabilities` 渲染的参数选项必须是模型实际支持的值
