# Acceptance Checklist: Unified Media Generation

## Core Functionality

- [ ] **Data Initialization**: Script `scripts/init_media_models.py` successfully runs and scrapes data.
    - [ ] Volcengine models found and scraped.
    - [ ] Aliyun Wanxiang models found and scraped.
    - [ ] Vidu models found and scraped.
    - [ ] Gemini models found and scraped.
    - [ ] `docs/vendor_model_reference/` populated with Markdown files.
    - [ ] `sql/init/vendor_model_init.sql` generated with correct INSERT statements for existing tables.
- [ ] **Database Migration**: Columns added to `ai_manufacturers` and `ai_models`.
    - [ ] `doc_url` added to `ai_manufacturers`.
    - [ ] `param_schema` added to `ai_models` (JSONB, not null).
    - [ ] Initial data populated correctly into existing tables.
- [ ] **Backend API**: `POST /v1/media/generate` endpoint functional.
    - [ ] Supports dynamic parameters via `param_json`.
    - [ ] Validates `param_json` against `param_schema` on the server.
    - [ ] Correctly routes request to the specific provider (Volcengine, Aliyun, Vidu, Gemini).
    - [ ] Returns standardized `MediaResponse`.
- [ ] **Frontend**: Dynamic form component renders correctly.
    - [ ] Fields match `param_schema` definitions (slider for range, select for enum).
    - [ ] Validation errors displayed for invalid inputs.

## Quality Assurance

- [ ] **Unit Tests**:
    - [ ] `param_schema` validation logic (coverage > 90%).
    - [ ] Provider factory logic.
- [ ] **Integration Tests**:
    - [ ] Mocked API calls verify request transformation logic.
    - [ ] Live API calls (with test keys) verify end-to-end flow for all 4 vendors.
- [ ] **Performance**:
    - [ ] Image generation latency < 50s (1024x1024).
    - [ ] Video generation latency < 120s (5s 480p).
- [ ] **Documentation**:
    - [ ] `docs/adr/0003-model-param-schema.md` created.
    - [ ] `docs/api/media_provider.md` (Swagger/OpenAPI) updated.
    - [ ] `README.md` updated with "How to add a new vendor".

## Security & Compliance

- [ ] API keys stored securely (encrypted or env vars).
- [ ] Usage tracked in audit logs.
- [ ] Cost calculation implemented and accurate.
