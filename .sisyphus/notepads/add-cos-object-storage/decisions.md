# Decisions: Add Configurable COS Object Storage

> Append-only log of architectural and implementation decisions.

---

## 2026-03-23 00:00 UTC — Task 6 minimal storage seam

- Added a provider-agnostic storage seam in `fastapi_backend/app/storage/storage_provider.py` only.
- Kept phase-1 runtime behavior MinIO-backed by having `get_storage_provider()` return `MinioStorageProvider`.
- Preserved storage package compatibility by continuing to export `get_minio_client()` and `normalize_minio_endpoint()` from `app.storage`.

## 2026-03-23 00:25 UTC — Task 7 MinIO helper hardening behind adapter

- Moved MinIO endpoint normalization, client construction, URL parsing/building, and URL-based download behavior into `MinioStorageProvider`.
- Kept `fastapi_backend/app/storage/minio_client.py` as a compatibility wrapper that delegates to `MinioStorageProvider`, so consumer modules remain untouched in this phase.
- Kept direct `Minio(` construction scoped to the storage adapter layer by centralizing it in `MinioStorageProvider._create_client()`.
