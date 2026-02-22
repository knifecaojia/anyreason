# Implementation Plan: Unified Media Generation

## Phase 1: Data Initialization

### Task 1.1: Web Scraping & Data Gathering
- [x] Create a Python script (`scripts/init_media_models.py`) using `playwright` or `requests` + `BeautifulSoup`.
- [x] Implement scrapers for:
    - [x] Volcengine (`https://www.volcengine.com/docs/82379/1666945?lang=zh`)
    - [x] Aliyun Wanxiang (`https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference?spm=a2c4g.11186623.help-menu-2400256.d_2_2_4.3b325598n1P1oC`)
    - [x] Vidu (`https://platform.vidu.cn/docs/introduction`)
    - [x] Google Gemini (`https://ai.google.dev/gemini-api/docs/image-generation`)
- [x] Parse model details (name, version, resolution, duration, price) from the pages.
- [x] Save results to `docs/vendor_model_reference/` as Markdown files.
- [x] Generate `sql/init/vendor_model_init.sql` with `INSERT` statements using Snowflake IDs for `ai_manufacturers` and `ai_models`.

### Task 1.2: Database Migration
- [x] Create database migration file (e.g., `fastapi_backend/alembic_migrations/versions/xxxx_add_media_columns.py`).
- [ ] Add `doc_url` column to `ai_manufacturers`.
- [ ] Add `param_schema` JSONB column to `ai_models`.
- [ ] Implement logic to run `sql/init/vendor_model_init.sql` (updated for existing tables) during migration or startup.

## Phase 2: Backend Implementation

### Task 2.1: Schema & Models
- [ ] Update `fastapi_backend/app/models.py` to reflect changes in `AIManufacturer` and `AIModel`.
- [ ] Create Pydantic schemas for `MediaRequest` and `MediaResponse` in `fastapi_backend/app/schemas_media.py`.
- [ ] Implement `param_schema` validation logic using `jsonschema` library.

### Task 2.2: Media Provider Interface
- [ ] Create `fastapi_backend/app/ai_gateway/providers/media_provider.py` defining the abstract base class.
- [ ] Implement concrete provider classes:
    - [ ] `VolcengineMediaProvider`
    - [ ] `AliyunMediaProvider`
    - [ ] `ViduMediaProvider`
    - [ ] `GeminiMediaProvider`
- [ ] Each provider must implement `generate(request: MediaRequest) -> MediaResponse`.
- [ ] Implement API request transformation logic (to vendor specific format) within each provider.

### Task 2.3: API Endpoint & Routing
- [ ] Create new router `fastapi_backend/app/ai_gateway/api/v1/media.py`.
- [ ] Define endpoint `POST /v1/media/generate`.
- [ ] Implement logic to fetch the correct provider based on `model_key`.
- [ ] Integrate with existing auditing and billing systems (similar to LLM usage).

## Phase 3: Frontend Integration & Verification

### Task 3.1: Dynamic Form Component
- [ ] Create a reusable React component (`components/MediaGenerationForm.tsx`) that takes `param_schema` as prop.
- [ ] Use a form library (e.g., `react-jsonschema-form` or custom implementation) to render the UI dynamically.
- [ ] Ensure validation runs on the client side based on the schema.

### Task 3.2: Integration & Testing
- [ ] Write unit tests for `param_schema` validation (positive and negative cases).
- [ ] Write integration tests for the `MediaProvider` factory.
- [ ] Create a test script to call each vendor's API (using test keys) and verify the output.
- [ ] Verify performance benchmarks (generation time).
- [ ] Update documentation (`docs/adr/0003-model-param-schema.md`, `docs/api/media_provider.md`, `README.md`).
