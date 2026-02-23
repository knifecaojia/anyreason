# 技术规格说明书：统一媒体生成平台集成方案

## 1. 概述 (Overview)

本通过展现有 `ai_manufacturers` 和 `ai_models` 表结构，集成火山引擎 (Volcengine)、阿里云万象 (Aliyun Wanxiang)、Vidu 和 Google Gemini 的图片与视频生成模型。核心目标是建立统一的 `MediaProvider` 接口和基于 JSON Schema 的动态参数配置系统，实现新模型的零代码接入。

## 2. 数据库设计 (Database Schema)

### 2.1 表结构变更 (Schema Changes)

不新建表，而是扩展现有表以支持媒体生成特性。

#### `ai_manufacturers` (厂商表)
| 字段名 | 类型 | 描述 | 变更类型 |
|---|---|---|---|
| `doc_url` | TEXT | 官方 API 文档链接，用于开发者参考 | **新增** |

#### `ai_models` (模型表)
| 字段名 | 类型 | 约束 | 描述 | 变更类型 |
|---|---|---|---|---|
| `param_schema` | JSONB | NOT NULL DEFAULT '{}' | **核心字段**：定义模型参数的 JSON Schema，驱动前端动态表单 | **新增** |
| `model_metadata` | JSONB | - | 存储 `max_resolution`, `max_duration`, `price_per_unit` 等元数据 | 现有字段复用 |

### 2.2 动态参数 Schema 设计 (`param_schema`)

遵循 **JSON Schema Draft-07** 标准。前端根据此 Schema 自动渲染表单。

**示例结构：**
```json
{
  "type": "object",
  "properties": {
    "width": {
      "type": "integer",
      "title": "宽度",
      "default": 1024,
      "minimum": 512,
      "maximum": 2048,
      "ui:widget": "slider",
      "ui:order": 1
    },
    "style": {
      "type": "string",
      "title": "风格",
      "enum": ["realistic", "anime", "3d"],
      "default": "realistic",
      "ui:widget": "select",
      "ui:order": 2
    }
  },
  "required": ["width", "style"]
}
```

## 3. 架构设计 (Architecture)

### 3.1 统一媒体接口 (`MediaProvider`)

在 `fastapi_backend/app/ai_gateway/providers` 下新增媒体生成抽象层。

```python
class MediaRequest(BaseModel):
    model_key: str              # 模型的唯一标识，如 'volcengine-v2'
    prompt: str                 # 正向提示词
    negative_prompt: Optional[str] = None
    param_json: Dict[str, Any]  # 动态参数，需通过 param_schema 校验
    callback_url: Optional[str] = None

class MediaResponse(BaseModel):
    url: str                    # 生成结果的 URL
    duration: Optional[float]   # 视频时长 (秒)
    cost: Optional[float]       # 预估消耗点数
    usage_id: str               # 审计日志 ID
    meta: Dict[str, Any]        # 厂商返回的原始元数据

class MediaProvider(ABC):
    @abstractmethod
    async def generate(self, request: MediaRequest) -> MediaResponse:
        """执行生成任务，处理厂商特定的鉴权和参数转换"""
        pass
```

### 3.2 模块划分

1.  **Gateway Layer**: `ai_gateway/api/v1/media.py` 负责接收请求，鉴权，加载模型配置，调用 Provider。
2.  **Provider Layer**: `ai_gateway/providers/media/*.py` 包含各厂商的具体实现 (`VolcengineProvider`, `AliyunProvider` 等)。
3.  **Validation Layer**: 使用 `jsonschema` 库在 Gateway 层统一校验 `param_json`。

## 4. 数据初始化策略 (Initialization)

已完成脚本开发，流程如下：
1.  **抓取**: `scripts/scrape_docs.py` 使用 Selenium 抓取四大厂商文档，保存至 `docs/vendor_model_reference/`。
2.  **生成 SQL**: `scripts/generate_init_sql.py` 解析 Markdown 文档，生成 `sql/init/vendor_model_init.sql`。
    - ID 生成：使用雪花算法确保全局唯一。
    - 幂等性：SQL 使用 `INSERT ... ON CONFLICT DO NOTHING` (或手动检查) 确保重复执行安全。
3.  **执行**: Alembic Migration (`83ccec4a37bd`) 负责在应用启动/迁移时执行该 SQL。

## 5. 前端集成 (Frontend Integration)

1.  **通用组件**: 开发 `MediaGenerationForm` 组件，接收 `param_schema` prop。
2.  **表单引擎**: 使用 `react-jsonschema-form` (或自研轻量级实现) 渲染 UI。
    - 支持 `ui:widget` 自定义控件 (Slider, Select, ColorPicker)。
    - 支持 `ui:order` 字段排序。
3.  **联动**: 模型切换时，自动拉取新模型的 schema 并重置表单状态。
