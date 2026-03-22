# Draft: Configurable COS Object Storage

## Requirements (confirmed)
- Add Tencent COS as a configurable alternative to existing MinIO object storage.
- Runtime/provider configuration should choose `minio` or `cos`.
- Keep existing MinIO support.
- Analysis and planning only in this session; no implementation.

## Technical Decisions
- Introduce a storage provider abstraction instead of scattering provider conditionals across business logic.
- Keep existing DB `minio_*` fields unchanged in phase 1; treat them as generic bucket/key pointers.
- Preserve current business behavior for upload, download, thumbnail, and generated-media flows.
- Update config/env/docs/tests as part of the same plan.
- COS phase-1 config should use the final full bucket identity directly when available (rather than requiring runtime bucket+APPID composition).
- Sensitive COS credentials may exist in ignored local reference material, but must never be copied into example env files, plan artifacts, or committed config.

## Research Findings
- Storage entrypoint is `fastapi_backend/app/storage/minio_client.py`.
- Direct MinIO coupling exists in VFS, script storage, download endpoints, canvas export, script structure reads, and Gemini media provider.
- Current code relies on MinIO SDK semantics such as `bucket_exists`, `make_bucket`, `put_object`, `get_object`, and `remove_object`.
- Current code also relies on MinIO URL helpers (`build_minio_url`, `parse_minio_url`, `download_minio_bytes`).
- Tencent COS introduces provider-specific constraints: bucket name with APPID, region-aware configuration, different endpoint/domain semantics, and path-style caveats.
- Local ignored reference file provides enough COS access data for planning baseline: full bucket name, region, public domain, and credentials.

## Scope Boundaries
- INCLUDE: storage abstraction, MinIO adapter preservation, COS adapter addition, provider config, tests, docs, deployment guidance.
- EXCLUDE: DB field renames, one-time historical data migration, unrelated storage feature expansion, forced MinIO removal.
- EXCLUDE: committing real COS credentials into tracked files or documentation examples.

## Open Questions
- None blocking for phase-1 planning; defaults applied conservatively:
  - Bucket auto-creation remains supported only where provider semantics allow it.
  - Existing DB field names remain as compatibility debt to be documented, not solved now.
