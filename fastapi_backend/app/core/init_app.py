from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket
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
from app.database import (
    create_db_and_tables,
    ensure_builtin_agent_platform_assets,
    ensure_builtin_permissions,
    ensure_builtin_roles,
    ensure_default_admin,
)
from app.log import setup_logging
from app.users import current_active_superuser
from app.utils import simple_generate_unique_route_id


limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.tasks.external_poller import run_external_poller
    from app.tasks.realtime import TaskWebSocketManager, redis_event_forwarder

    if settings.AUTO_DB_INIT_ON_STARTUP:
        await create_db_and_tables()
        if settings.AUTO_DB_SEED_ON_STARTUP:
            await ensure_builtin_roles()
            await ensure_builtin_permissions()
            await ensure_builtin_agent_platform_assets()
            await ensure_default_admin()

    manager = TaskWebSocketManager()
    stop_event = asyncio.Event()
    forwarder = asyncio.create_task(redis_event_forwarder(manager=manager, stop_event=stop_event))
    poller = asyncio.create_task(run_external_poller(stop_event=stop_event))
    app.state.task_ws_manager = manager
    app.state.task_ws_stop_event = stop_event
    app.state.task_ws_forwarder = forwarder
    app.state.external_poller = poller
    yield

    stop_event.set()
    forwarder.cancel()
    poller.cancel()
    try:
        await forwarder
    except BaseException:
        pass
    try:
        await poller
    except BaseException:
        pass
    await manager.close_all()


def make_middlewares() -> list[Middleware]:
    return [
        Middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins_list,
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

    from app.tasks.ws import handle_task_ws

    @app.websocket("/ws/tasks")
    async def ws_tasks(websocket: WebSocket):
        await handle_task_ws(websocket=websocket, manager=app.state.task_ws_manager)


from app.users import current_user_via_any


def register_docs(app: FastAPI) -> None:
    @app.get("/docs", include_in_schema=False)
    async def custom_swagger_ui_html(
        _: object = Depends(current_user_via_any),
    ):
        return get_swagger_ui_html(
            openapi_url=settings.OPENAPI_URL,
            title=app.title + " - Swagger UI",
            swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
            swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        )

    @app.get("/redoc", include_in_schema=False)
    async def redoc_html(
        _: object = Depends(current_user_via_any),
    ):
        return get_redoc_html(openapi_url=settings.OPENAPI_URL, title=app.title + " - ReDoc")

    @app.get(settings.OPENAPI_URL, include_in_schema=False)
    async def openapi_endpoint(
        _: object = Depends(current_user_via_any),
    ):
        if app.openapi_schema:
            return app.openapi_schema
        
        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        
        # Ensure X-API-KEY is in security schemes if not auto-detected
        if "components" not in openapi_schema:
            openapi_schema["components"] = {}
        if "securitySchemes" not in openapi_schema["components"]:
            openapi_schema["components"]["securitySchemes"] = {}
        
        openapi_schema["components"]["securitySchemes"]["ApiKeyHeader"] = {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-KEY",
            "description": "Admin-issued API Key for external access"
        }
        
        app.openapi_schema = openapi_schema
        return app.openapi_schema


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
