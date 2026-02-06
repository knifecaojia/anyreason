from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware import Middleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.router import api_router
from app.config import settings
from app.core.exceptions import AppError, app_error_handler, unhandled_exception_handler
from app.core.middlewares import RequestLoggingMiddleware, SecurityHeadersMiddleware
from app.database import create_db_and_tables, ensure_builtin_permissions, ensure_builtin_roles, ensure_default_admin
from app.log import setup_logging
from app.users import current_active_superuser
from app.utils import simple_generate_unique_route_id


limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await create_db_and_tables()
    await ensure_builtin_roles()
    await ensure_builtin_permissions()
    await ensure_default_admin()
    yield


def make_middlewares() -> list[Middleware]:
    return [
        Middleware(
            CORSMiddleware,
            allow_origins=list(settings.CORS_ORIGINS),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        ),
        Middleware(SecurityHeadersMiddleware),
        Middleware(RequestLoggingMiddleware),
        Middleware(SlowAPIMiddleware),
    ]


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.state.limiter = limiter


def register_routes(app: FastAPI) -> None:
    app.include_router(api_router, prefix="/api")


def register_docs(app: FastAPI) -> None:
    @app.get("/docs", include_in_schema=False)
    async def custom_swagger_ui_html(
        _: object = Depends(current_active_superuser),
    ):
        return get_swagger_ui_html(
            openapi_url=settings.OPENAPI_URL,
            title=app.title + " - Swagger UI",
        )

    @app.get("/redoc", include_in_schema=False)
    async def redoc_html(
        _: object = Depends(current_active_superuser),
    ):
        return get_redoc_html(openapi_url=settings.OPENAPI_URL, title=app.title + " - ReDoc")

    @app.get(settings.OPENAPI_URL, include_in_schema=False)
    async def openapi_endpoint(
        _: object = Depends(current_active_superuser),
    ):
        return get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )


def create_app() -> FastAPI:
    setup_logging()

    app = FastAPI(
        title=getattr(settings, "APP_TITLE", "AnyReason API"),
        description=getattr(settings, "APP_DESCRIPTION", ""),
        version=getattr(settings, "VERSION", "0.0.0"),
        generate_unique_id_function=simple_generate_unique_route_id,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        middleware=make_middlewares(),
        lifespan=lifespan,
    )

    register_exception_handlers(app)
    register_routes(app)
    register_docs(app)

    return app
