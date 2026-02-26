from typing import Set

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # OpenAPI docs
    OPENAPI_URL: str = "/openapi.json"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/anyreason"
    TEST_DATABASE_URL: str | None = "postgresql+asyncpg://postgres:postgres@localhost:5432/anyreason_test"
    EXPIRE_ON_COMMIT: bool = False

    # Redis (task queue + events)
    REDIS_URL: str = "redis://localhost:6379/0"
    TASK_QUEUE_KEY: str = "tasks:queue"
    TASK_EVENTS_CHANNEL: str = "tasks:events"

    # User
    ACCESS_SECRET_KEY: str = "dev_access_secret_key"
    RESET_PASSWORD_SECRET_KEY: str = "dev_reset_password_secret_key"
    VERIFICATION_SECRET_KEY: str = "dev_verification_secret_key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 3600

    # Email
    MAIL_USERNAME: str | None = None
    MAIL_PASSWORD: str | None = None
    MAIL_FROM: str | None = None
    MAIL_SERVER: str | None = None
    MAIL_PORT: int | None = None
    MAIL_FROM_NAME: str = "FastAPI template"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True
    TEMPLATE_DIR: str = "email_templates"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # CORS — 支持逗号分隔字符串或 JSON 数组格式
    CORS_ORIGINS: Set[str] = {"http://localhost:3000"}

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> object:
        """Accept comma-separated string, JSON array, or Set."""
        if isinstance(v, str):
            v = v.strip()
            # 如果看起来像 JSON 数组就尝试解析
            if v.startswith("["):
                import json
                try:
                    return set(json.loads(v))
                except json.JSONDecodeError:
                    # 方括号但不是合法 JSON，去掉方括号当逗号分隔处理
                    v = v.strip("[]")
            return {origin.strip() for origin in v.split(",") if origin.strip()}
        return v

    # Default admin seed (development convenience)
    CREATE_DEFAULT_ADMIN: bool = False
    DEFAULT_ADMIN_EMAIL: str | None = None
    DEFAULT_ADMIN_PASSWORD: str | None = None
    DEFAULT_INITIAL_CREDITS: int = 100

    AUTO_DB_INIT_ON_STARTUP: bool = True
    AUTO_DB_SEED_ON_STARTUP: bool = True

    # MinIO (S3 compatible object storage)
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    MINIO_BUCKET_SCRIPTS: str = "anyreason-scripts"
    MINIO_BUCKET_VFS: str = "anyreason-vfs"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
