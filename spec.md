# Technical Specification: Unified Media Generation Platform

## 1. Overview
This document outlines the technical design for integrating Volcengine, Aliyun Wanxiang, Vidu, and Google Gemini image and video generation models into the existing platform. The goal is to provide a unified interface for media generation with dynamic configuration capabilities.

## 2. Database Schema Design

### 2.1 Table Modifications
Instead of creating new tables, we will extend the existing `ai_manufacturers` and `ai_models` tables to support media generation requirements.

#### Table: `ai_manufacturers` (Existing)
Already supports `(code, category)` unique constraint, allowing separate configurations for "image" and "video" categories for the same vendor.

**New Columns:**
| Column | Type | Description |
|---|---|---|
| `doc_url` | TEXT | Link to official documentation |

#### Table: `ai_models` (Existing)
Stores metadata for specific models.

**New Columns:**
| Column | Type | Constraints | Description |
|---|---|---|---|
| `param_schema` | JSONB | NOT NULL DEFAULT '{}' | **Core Field**: JSON Schema for dynamic UI |

**Existing Fields Usage:**
- `model_metadata` (JSONB): Will store `max_resolution`, `max_duration`, `price_per_unit`, `frame_rate`, etc.
- `manufacturer_id`: Links to the specific `(vendor, category)` entry in `ai_manufacturers`.

### 2.2 `param_schema` Design
The `param_schema` field will follow JSON Schema Draft-07 standards to drive the frontend UI generation.

### 2.2 `param_schema` Design
The `param_schema` field will follow JSON Schema Draft-07 standards to drive the frontend UI generation.

**Example Structure:**
```json
{
  "type": "object",
  "properties": {
    "width": {
      "type": "integer",
      "title": "Width",
      "default": 1024,
      "minimum": 512,
      "maximum": 2048,
      "ui:widget": "slider",
      "ui:order": 1
    },
    "style": {
      "type": "string",
      "title": "Style",
      "enum": ["realistic", "anime", "3d"],
      "default": "realistic",
      "ui:widget": "select",
      "ui:order": 2
    }
  },
  "required": ["width", "style"]
}
```

## 3. Architecture

### 3.1 Media Provider Interface
A new interface `MediaProvider` will be added to the `ai_gateway` module, mirroring the `LLMProvider` pattern but specialized for media.

```python
class MediaRequest(BaseModel):
    model_key: str
    prompt: str
    negative_prompt: Optional[str] = None
    param_json: Dict[str, Any]  # Validated against param_schema
    callback_url: Optional[str] = None

class MediaResponse(BaseModel):
    url: str
    duration: Optional[float] = None
    cost: Optional[float] = None
    usage_id: str

class MediaProvider(ABC):
    @abstractmethod
    async def generate(self, request: MediaRequest) -> MediaResponse:
        pass
```

### 3.2 Integration Strategy
1.  **Vendor Implementation**: Each vendor (Volcengine, Aliyun, Vidu, Gemini) will have a dedicated implementation of `MediaProvider`.
2.  **Factory Pattern**: A `MediaProviderFactory` will instantiate the correct provider based on the `model_key`.
3.  **Unified API**: The existing `ai_gateway` router will be updated to handle `/v1/media/generate` requests, routing them through the `MediaProvider`.
4.  **Schema Updates**: `AIManufacturer` and `AIModel` tables will be updated via Alembic migrations.

## 4. Data Initialization Strategy

1.  **Scraping**: A Python script using `playwright` or `requests` + `BeautifulSoup` (depending on complexity) will fetch model metadata from the specified URLs.
2.  **Storage**: Metadata will be saved to `docs/vendor_model_reference/` as Markdown files.
3.  **SQL Generation**: The script will generate `sql/init/vendor_model_init.sql` with `INSERT` statements using Snowflake IDs for the existing `ai_manufacturers` and `ai_models` tables.
4.  **Migration**: Flyway/Liquibase (or the existing Alembic setup) will be used to apply the SQL.

## 5. Testing Plan
-   **Unit Tests**: Verify `param_schema` validation logic and `MediaProvider` factory routing.
-   **Integration Tests**: Mocked API calls to vendors to verify request transformation.
-   **Live Tests**: Actual calls to vendor APIs (using test keys) to verify end-to-end flow.
